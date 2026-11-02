import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';

// A docs page holds a line `**From SPEC.md:** [Name](<SPEC.md URL>#<section>)` where it takes a section of SPEC.md.
// The build puts the section's text there, so a rule is written once. The line reads as a link on GitHub, and a line
// naming a section SPEC.md does not have fails the build, and so the gate.

const ROOT = join(process.cwd(), '..');
const SPECS_DIR = join(ROOT, 'specs');
const REPO_BLOB = 'https://github.com/behavioralstate/spec/blob/main/';
const SPEC_URL = `${REPO_BLOB}SPEC.md`;
const MARKER = /^\*\*From SPEC\.md:\*\* \[[^\]]*\]\(https:\/\/github\.com\/behavioralstate\/spec\/blob\/main\/SPEC\.md#([^)]+)\)\s*$/;
const FENCE = /^\s*(```|~~~)/;

interface SpecSection {
	id: string;
	lines: string[];
	anchors: Set<string>;
}

export interface Spec {
	sections: SpecSection[];
	/** The page built from each section, by the section's id. */
	pages: Map<string, { slug: string; headings: Set<string> }>;
}

/** Recursively collect all .md files under a directory. */
export async function collectMdFiles(dir: string): Promise<string[]> {
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

/** A heading's id as GitHub makes it, so the site's ids are the anchors SPEC.md links to. Text may hold HTML. */
export function slugify(text: string): string {
	return text
		.replace(/<[^>]+>/g, '')
		.replace(/&(amp|lt|gt|quot|#39);/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9_\s-]/g, '')
		.trim()
		.replace(/\s/g, '-');
}

/** Calls back on every line outside a fenced code block, whose return value replaces it. */
function mapOutsideFences(lines: string[], fn: (line: string) => string): string[] {
	let fenced = false;
	return lines.map((line) => {
		if (FENCE.test(line)) {
			fenced = !fenced;
			return line;
		}
		return fenced ? line : fn(line);
	});
}

function headingsOf(lines: string[]): { level: number; text: string }[] {
	const headings: { level: number; text: string }[] = [];
	mapOutsideFences(lines, (line) => {
		const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
		if (match) headings.push({ level: match[1].length, text: match[2] });
		return line;
	});
	return headings;
}

function parseSections(markdown: string): SpecSection[] {
	const sections: SpecSection[] = [];
	const seen = new Map<string, number>();
	const uniqueId = (text: string) => {
		const id = slugify(text);
		const count = seen.get(id);
		seen.set(id, (count ?? -1) + 1);
		return count === undefined ? id : `${id}-${count + 1}`;
	};
	let current: SpecSection | undefined;
	let fenced = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (FENCE.test(line)) fenced = !fenced;
		const heading = fenced ? null : line.match(/^(#{1,6})\s+(.+?)\s*$/);
		if (heading) {
			const id = uniqueId(heading[2]);
			if (heading[1].length <= 2) {
				current = heading[1].length === 2 ? { id, lines: [], anchors: new Set([id]) } : undefined;
				if (current) sections.push(current);
				continue;
			}
			current?.anchors.add(id);
		}
		current?.lines.push(line);
	}
	return sections;
}

/** Reads SPEC.md and every page's markers. Fails on a marker that names no section of SPEC.md. */
export async function loadSpec(): Promise<Spec> {
	const sections = parseSections(await readFile(join(ROOT, 'SPEC.md'), 'utf-8'));
	const pages: Spec['pages'] = new Map();
	for (const file of await collectMdFiles(SPECS_DIR)) {
		const slug = relative(SPECS_DIR, file).replace(/\.md$/, '').replace(/\\/g, '/');
		const lines = (await readFile(file, 'utf-8')).split(/\r?\n/);
		const headings = new Set(headingsOf(lines).filter((h) => h.level > 1).map((h) => slugify(h.text)));
		mapOutsideFences(lines, (line) => {
			const id = line.match(MARKER)?.[1];
			if (id === undefined) return line;
			if (!sections.some((s) => s.id === id)) {
				throw new Error(`specs/${slug}.md is built from SPEC.md#${id}, and SPEC.md has no such section`);
			}
			const other = pages.get(id);
			if (other) throw new Error(`specs/${slug}.md and specs/${other.slug}.md are both built from SPEC.md#${id}`);
			pages.set(id, { slug, headings });
			return line;
		});
	}
	return { sections, pages };
}

/** Where a heading of SPEC.md is read: on the page built from its section, else on GitHub. Fails on an unknown anchor. */
function hrefOfAnchor(anchor: string, spec: Spec, where: string): string {
	const section = spec.sections.find((s) => s.anchors.has(anchor));
	if (!section) throw new Error(`${where} links to SPEC.md#${anchor}, and SPEC.md has no such heading`);
	const page = spec.pages.get(section.id);
	if (!page) return `${SPEC_URL}#${anchor}`;
	// A section's own heading is dropped where it is inserted, unless the page writes it above the marker.
	if (anchor === section.id && !page.headings.has(anchor)) return `/specs/${page.slug}`;
	return `/specs/${page.slug}#${anchor}`;
}

/** A link in SPEC.md, relative to the repository's root, as the site reads it. */
function hrefOfSpecLink(target: string, spec: Spec, where: string): string {
	if (/^https?:/.test(target)) return target;
	if (target.startsWith('#')) return hrefOfAnchor(target.slice(1), spec, where);
	if (target.startsWith('protocol/v1/')) return `/${target.replace('protocol/', '')}`;
	const page = target.match(/^specs\/(.+?)\.md(#.*)?$/);
	if (page) return `/specs/${page[1]}${page[2] ?? ''}`;
	return `${REPO_BLOB}${target}`;
}

/** Puts each section of SPEC.md a page names where it names it: no `##` of its own, its `###` become the page's `##`. */
export function insertSections(markdown: string, slug: string, spec: Spec): string {
	const where = `SPEC.md, as specs/${slug}.md,`;
	return mapOutsideFences(markdown.split(/\r?\n/), (line) => {
		const id = line.match(MARKER)?.[1];
		if (id === undefined) return line;
		const section = spec.sections.find((s) => s.id === id)!;
		return mapOutsideFences(section.lines, (l) =>
			l
				.replace(/^###(?=\s)/, '##')
				// SPEC.md's pointer to the page being built is its text alone: the reader is on it.
				.replaceAll(`](specs/${slug}.md)`, '](#)')
				.replace(/\[([^\]]*)\]\(#\)/g, '$1')
				.replace(/\]\(([^)\s]+)\)/g, (_m, target: string) => `](${hrefOfSpecLink(target, spec, where)})`)
		).join('\n');
	}).join('\n');
}

/** A page's links to SPEC.md go to the page built from that section where there is one. */
export function localiseSpecLinks(html: string, slug: string, spec: Spec): string {
	return html.replace(/href="https:\/\/github\.com\/behavioralstate\/spec\/blob\/main\/SPEC\.md#([^"]+)"/g, (_m, anchor: string) =>
		`href="${hrefOfAnchor(anchor, spec, `specs/${slug}.md`)}"`
	);
}
