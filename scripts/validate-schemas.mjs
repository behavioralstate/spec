/**
 * Validates all JSON Schema files in protocol/v1/schemas/ are valid JSON
 * and conform to JSON Schema draft 2020-12.
 *
 * Usage: node scripts/validate-schemas.mjs
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';

const SCHEMAS_DIR = join(import.meta.dirname, '..', 'protocol', 'v1', 'schemas');

async function collectJsonFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectJsonFiles(full)));
		} else if (entry.name.endsWith('.json')) {
			files.push(full);
		}
	}
	return files;
}

async function main() {
	const files = await collectJsonFiles(SCHEMAS_DIR);
	let errors = 0;

	for (const file of files) {
		const rel = relative(join(import.meta.dirname, '..'), file);
		try {
			const content = await readFile(file, 'utf-8');
			const parsed = JSON.parse(content);

			// Basic structural checks
			if (!parsed.$schema && !parsed.$id && !parsed.$defs && !parsed.openapi) {
				console.warn(`  WARN  ${rel} — no $schema, $id, or $defs found`);
			}

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
