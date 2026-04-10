<script>
	import DocsSidebar from '$lib/components/DocsSidebar.svelte';
	import { afterNavigate } from '$app/navigation';
	let { children } = $props();
	let sidebarOpen = $state(false);

	afterNavigate(() => {
		sidebarOpen = false;
	});

	const sha = import.meta.env.VITE_GIT_SHA;
	const buildTime = import.meta.env.VITE_BUILD_TIME;
	const shortSha = sha ? sha.slice(0, 7) : null;
	const buildDate = buildTime ? new Date(buildTime).toUTCString().replace(':00 GMT', ' UTC') : null;
	const commitUrl = sha ? `https://github.com/openagentprotocol/spec/commit/${sha}` : null;
</script>

<div class="docs-shell">
	<button
		class="mobile-menu-btn"
		onclick={() => (sidebarOpen = !sidebarOpen)}
		aria-label="Toggle navigation"
		aria-expanded={sidebarOpen}
	>
		{#if sidebarOpen}×{:else}☰{/if}
	</button>

	{#if sidebarOpen}
		<div class="sidebar-overlay" role="presentation" onclick={() => (sidebarOpen = false)}></div>
	{/if}

	<DocsSidebar open={sidebarOpen} />

	<div class="docs-body">
		{@render children()}
		{#if shortSha}
		<footer class="build-info">
			Built from <a href={commitUrl} target="_blank" rel="noopener">{shortSha}</a>{#if buildDate} &middot; {buildDate}{/if}
		</footer>
		{/if}
	</div>
</div>

<style>
	.docs-shell {
		display: flex;
		min-height: calc(100vh - var(--nav-height));
		background: #ffffff;
		/* Light theme — scoped to docs only so the home page stays dark */
		--color-bg: #ffffff;
		--color-bg-secondary: #f7f7fc;
		--color-bg-card: #f1f2f8;
		--color-border: #e2e4f0;
		--color-text: #1e1e3f;
		--color-text-muted: #6b6b8a;
		--color-accent: #4f46e5;
		--color-accent-hover: #4338ca;
	}

	.docs-body {
		flex: 1;
		min-width: 0;
	}

	.build-info {
		padding: 1rem 2rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		border-top: 1px solid var(--color-border);
		margin-top: 2rem;
	}

	.build-info a {
		color: var(--color-accent);
		text-decoration: none;
		font-family: monospace;
	}

	.build-info a:hover {
		text-decoration: underline;
	}

	/* Mobile FAB toggle */
	.mobile-menu-btn {
		display: none;
	}

	.sidebar-overlay {
		display: none;
	}

	@media (max-width: 767px) {
		.mobile-menu-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			position: fixed;
			bottom: 1.5rem;
			right: 1.5rem;
			z-index: 200;
			width: 48px;
			height: 48px;
			border-radius: 50%;
			border: none;
			background: var(--color-accent);
			color: #fff;
			font-size: 1.25rem;
			line-height: 1;
			cursor: pointer;
			box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
			transition: background 0.15s;
		}

		.mobile-menu-btn:hover {
			background: var(--color-accent-hover);
		}

		.sidebar-overlay {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.35);
			z-index: 90;
		}
	}
</style>
