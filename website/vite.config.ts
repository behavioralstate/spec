import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		'import.meta.env.VITE_GIT_SHA': JSON.stringify(process.env.VITE_GIT_SHA ?? ''),
		'import.meta.env.VITE_BUILD_TIME': JSON.stringify(process.env.VITE_BUILD_TIME ?? '')
	}
});
