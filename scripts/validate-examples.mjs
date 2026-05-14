/**
 * Validates all example JSON files in protocol/v1/examples/
 * are valid JSON.
 *
 * Usage: node scripts/validate-examples.mjs
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const EXAMPLES_DIR = join(import.meta.dirname, '..', 'protocol', 'v1', 'examples');

async function main() {
	const entries = await readdir(EXAMPLES_DIR);
	const files = entries.filter((f) => f.endsWith('.json'));
	let errors = 0;

	for (const file of files) {
		const full = join(EXAMPLES_DIR, file);
		const rel = relative(join(import.meta.dirname, '..'), full);
		try {
			const content = await readFile(full, 'utf-8');
			JSON.parse(content);
			console.log(`  OK    ${rel}`);
		} catch (err) {
			console.error(`  FAIL  ${rel} — ${err.message}`);
			errors++;
		}
	}

	console.log(`\n${files.length} files checked, ${errors} errors.`);
	process.exit(errors > 0 ? 1 : 0);
}

main();
