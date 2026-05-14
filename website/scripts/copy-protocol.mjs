/**
 * Copies protocol artifacts (schemas, services, examples) into website/static/
 * so they're served as static files at stable URLs after build.
 *
 * Run before `vite build`: node scripts/copy-protocol.mjs
 *
 * Version stamping: reads version.json from the repo root and replaces every
 * occurrence of the literal string {{BSP_VERSION}} in the copied files with
 * the real version. This keeps the source files version-agnostic — the single
 * source of truth is version.json.
 */

import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const staticDir = join(__dirname, '..', 'static');

// Read the single source-of-truth version
const { version } = JSON.parse(readFileSync(join(root, 'version.json'), 'utf-8'));

/** Recursively copy src → dest, stamping {{BSP_VERSION}} in every text file. */
function copyAndStamp(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyAndStamp(srcPath, destPath);
    } else {
      const content = readFileSync(srcPath, 'utf-8');
      const stamped = content.replaceAll('{{BSP_VERSION}}', version);
      writeFileSync(destPath, stamped, 'utf-8');
    }
  }
}

// Copy protocol/v1/ → static/v1/ with version stamping
copyAndStamp(join(root, 'protocol', 'v1'), join(staticDir, 'v1'));

console.log(`Copied protocol/v1/ → static/v1/ (version: ${version})`);
