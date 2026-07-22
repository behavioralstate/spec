/**
 * Copies protocol/v1/schemas/ into validate-cli/schemas/ so the published
 * package embeds the JSON Schemas it validates against. Run via `npm run build`.
 */
import { cp, rm } from 'fs/promises';
import { join } from 'path';

const src = join(import.meta.dirname, '..', '..', 'protocol', 'v1', 'schemas');
const dest = join(import.meta.dirname, '..', 'schemas');

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`Synced schemas: ${src} -> ${dest}`);
