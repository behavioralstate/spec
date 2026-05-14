import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'version.json'), 'utf-8'));

export default defineConfig({
	define: {
		__BSP_VERSION__: JSON.stringify(version)
	},
	plugins: [tailwindcss(), sveltekit()]
});
