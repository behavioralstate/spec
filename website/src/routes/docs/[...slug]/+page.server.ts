import { error } from '@sveltejs/kit';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, dirname } from 'path';

const SPECS_DIR = join(process.cwd(), '..', 'specs');

export interface TocHeading {
	id: string;
	text: string;
	level: number;
}

/** Recursively collect all .md files under a directory. */
async function collectMdFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectMdFiles(full)));
		} else if (entry.name.endsWith('.md')) {
			files.push(full);
		}
	}
	return files;
}

export async function entries() {
	const files = await collectMdFiles(SPECS_DIR);
	return files.map((f) => {
		const rel = relative(SPECS_DIR, f).replace(/\.md$/, '').replace(/\\/g, '/');
		return { slug: rel };
	});
}

/**
 * Rewrite relative links in rendered HTML:
 * - Links to other .md spec files → /docs/... routes
 * - Links to protocol artifacts → /v1/... static files
 */
function rewriteLinks(html: string, slug: string): string {
	const currentDir = dirname(slug);

	return html.replace(/href="([^"]+)"/g, (_match, href: string) => {
		// Skip absolute URLs and anchors
		if (href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) {
			return `href="${href}"`;
		}

		// Resolve relative path from the current spec file's perspective
		const parts = [...currentDir.split('/').filter(Boolean)];
		for (const segment of href.split('/')) {
			if (segment === '..') parts.pop();
			else if (segment !== '.') parts.push(segment);
		}
		const resolved = parts.join('/');

		// Protocol artifacts (protocol/v1/...) → /v1/...
		if (resolved.startsWith('protocol/v1/')) {
			return `href="/${resolved.replace('protocol/', '')}"`;
		}

		// Other spec .md files → /docs/... routes (with optional #anchor)
		if (resolved.includes('.md')) {
			const mdHashMatch = resolved.match(/^(.+?)\.md(#(.*))?$/);
			if (mdHashMatch) {
				const route = mdHashMatch[1];
				const hash = mdHashMatch[3] ? `#${mdHashMatch[3]}` : '';
				return `href="/docs/${route}${hash}"`;
			}
		}

		return `href="${href}"`;
	});
}

/** Convert heading text (may contain HTML tags) to a URL-safe id. */
function slugify(text: string): string {
	return text
		.replace(/<[^>]+>/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

/**
 * Add id attributes to h2/h3 headings and extract them for the TOC.
 * Existing id attributes are preserved.
 */
function processHeadings(html: string): { html: string; headings: TocHeading[] } {
	const headings: TocHeading[] = [];
	const idCounts: Record<string, number> = {};

	const processed = html.replace(/<h([23])([^>]*)>([\s\S]+?)<\/h\1>/g, (_, level, attrs, content) => {
		// Don't add a second id if one already exists
		if (/id="/.test(attrs)) {
			const existingId = attrs.match(/id="([^"]+)"/)?.[1] ?? '';
			headings.push({ id: existingId, text: content.replace(/<[^>]+>/g, ''), level: parseInt(level) });
			return `<h${level}${attrs}>${content}</h${level}>`;
		}
		let id = slugify(content);
		if (idCounts[id] !== undefined) {
			idCounts[id]++;
			id = `${id}-${idCounts[id]}`;
		} else {
			idCounts[id] = 0;
		}
		headings.push({ id, text: content.replace(/<[^>]+>/g, ''), level: parseInt(level) });
		return `<h${level}${attrs} id="${id}">${content}</h${level}>`;
	});

	return { html: processed, headings };
}

/** Classify blockquotes as tip/warning based on the first bold keyword. */
function classifyBlockquotes(html: string): string {
	return html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_match, inner) => {
		const firstStrong = inner.match(/<strong>([\s\S]*?)<\/strong>/);
		if (firstStrong) {
			const keyword = firstStrong[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
			if (keyword.startsWith('tip') || keyword.startsWith('note')) {
				return `<blockquote class="tip">${inner}</blockquote>`;
			}
			if (keyword.startsWith('warning') || keyword.startsWith('caution')) {
				return `<blockquote class="warning">${inner}</blockquote>`;
			}
		}
		return `<blockquote>${inner}</blockquote>`;
	});
}

/** Build breadcrumb segments from a slug like "agents/registry". */
function buildBreadcrumb(slug: string): { label: string }[] {
	const sectionLabels: Record<string, string> = {
		agents: 'Agents',
		transports: 'Transports'
	};
	const parts = slug.split('/');
	if (parts.length === 1) return [];
	return parts.slice(0, -1).map((part) => ({
		label: sectionLabels[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
	}));
}

export async function load({ params }) {
	const slug = params.slug;
	const filePath = join(SPECS_DIR, `${slug}.md`);

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) throw new Error('Not a file');
	} catch {
		error(404, `Spec page not found: ${slug}`);
	}

	const markdown = await readFile(filePath, 'utf-8');
	const { marked } = await import('marked');
	let html = await marked(markdown);
	html = rewriteLinks(html, slug);
	html = classifyBlockquotes(html);
	const { html: processedHtml, headings } = processHeadings(html);

	// Extract title from first # heading
	const titleMatch = markdown.match(/^#\s+(.+)$/m);
	const title = titleMatch ? titleMatch[1] : slug;

	const breadcrumb = buildBreadcrumb(slug);

	return { html: processedHtml, headings, title, slug, breadcrumb };
}

