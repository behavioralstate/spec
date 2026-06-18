import { readdir } from 'fs/promises';
import { join, relative } from 'path';

// Prerendered at build time (adapter-static writes build/sitemap.xml). Enumerates every spec page
// from the markdown sources so the sitemap can never drift from the actual /specs/* routes.
export const prerender = true;

const SPECS_DIR = join(process.cwd(), '..', 'specs');
const ORIGIN = 'https://behavioralstate.io';

/** Recursively collect all .md files under a directory (mirrors the docs route's collector). */
async function collectMdFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await collectMdFiles(full)));
		else if (entry.name.endsWith('.md')) files.push(full);
	}
	return files;
}

export async function GET() {
	const slugs = (await collectMdFiles(SPECS_DIR)).map((f) =>
		relative(SPECS_DIR, f).replace(/\.md$/, '').replace(/\\/g, '/')
	);

	const urls = [
		`${ORIGIN}/`,
		`${ORIGIN}/specs`,
		`${ORIGIN}/playground`,
		...slugs.map((slug) => `${ORIGIN}/specs/${slug}`)
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;

	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
