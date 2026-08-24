import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';

const ROADMAP_FILE = join(process.cwd(), '..', 'ROADMAP.md');
const VERSION_FILE = join(process.cwd(), '..', 'version.json');
const REPO_BLOB = 'https://github.com/behavioralstate/spec/blob/main';

export interface TocHeading {
	id: string;
	text: string;
	level: number;
}

/**
 * Rewrite repo-relative links for the site:
 * - specs/*.md → /specs/... routes (the only repo files also rendered here)
 * - every other relative path (SPEC.md, MIGRATION.md, standards/, validate-cli/, …)
 *   → the file on GitHub, which is where those artifacts live
 */
function rewriteLinks(html: string): string {
	return html.replace(/href="([^"]+)"/g, (_match, href: string) => {
		if (href.startsWith('http') || href.startsWith('#') || href.startsWith('/')) {
			return `href="${href}"`;
		}
		const specMatch = href.match(/^specs\/(.+?)\.md(#(.*))?$/);
		if (specMatch) {
			const hash = specMatch[3] ? `#${specMatch[3]}` : '';
			return `href="/specs/${specMatch[1]}${hash}"`;
		}
		return `href="${REPO_BLOB}/${href}"`;
	});
}

function slugify(text: string): string {
	return text
		.replace(/<[^>]+>/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
}

/** Add id attributes to h2 headings and extract them for the TOC (h3s are noise here). */
function processHeadings(html: string): { html: string; headings: TocHeading[] } {
	const headings: TocHeading[] = [];
	const idCounts: Record<string, number> = {};

	const processed = html.replace(/<h2([^>]*)>([\s\S]+?)<\/h2>/g, (_, attrs, content) => {
		let id = slugify(content);
		if (idCounts[id] !== undefined) {
			idCounts[id]++;
			id = `${id}-${idCounts[id]}`;
		} else {
			idCounts[id] = 0;
		}
		headings.push({ id, text: content.replace(/<[^>]+>/g, ''), level: 2 });
		return `<h2${attrs} id="${id}">${content}</h2>`;
	});

	return { html: processed, headings };
}

export async function load() {
	let markdown: string;
	try {
		markdown = await readFile(ROADMAP_FILE, 'utf-8');
	} catch {
		error(404, 'Roadmap not found');
	}

	const { version } = JSON.parse(await readFile(VERSION_FILE, 'utf-8'));
	const { marked } = await import('marked');
	let html = await marked(markdown.replaceAll('{{BEST_VERSION}}', version));
	html = rewriteLinks(html);
	const { html: processedHtml, headings } = processHeadings(html);

	return { html: processedHtml, headings };
}
