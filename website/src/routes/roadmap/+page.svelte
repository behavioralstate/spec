<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Roadmap — BEST</title>
	<meta
		name="description"
		content="Where the BEST protocol stands, the standards track, and what's next."
	/>
</svelte:head>

<div class="roadmap-shell">
<div class="page-wrapper">
	<article class="page-content">
		<div class="docs-content">
			{@html data.html}
		</div>
	</article>

	{#if data.headings.length > 1}
		<aside class="toc-sidebar">
			<p class="toc-label">On this page</p>
			<ul>
				{#each data.headings as h}
					<li>
						<a href="#{h.id}">{h.text}</a>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>
</div>

<style>
	.roadmap-shell {
		min-height: calc(100vh - var(--nav-height));
		background: #ffffff;
		/* Light theme — same scoped variable set as the docs shell, so the shared
		   .docs-content prose styles render on their intended background */
		--color-bg: #ffffff;
		--color-bg-secondary: #f7f7fc;
		--color-bg-card: #f1f2f8;
		--color-border: #e2e4f0;
		--color-text: #1e1e3f;
		--color-text-muted: #6b6b8a;
		--color-accent: #4f46e5;
		--color-accent-hover: #4338ca;
	}

	.page-wrapper {
		display: flex;
		align-items: flex-start;
		gap: 0;
		max-width: 1120px;
		margin: 0 auto;
	}

	.page-content {
		flex: 1;
		min-width: 0;
		max-width: 820px;
		padding: 2.5rem 3rem 4rem;
	}

	@media (max-width: 767px) {
		.page-content {
			padding: 1.75rem 1.25rem 3rem;
		}
	}

	/* Right TOC */
	.toc-sidebar {
		display: none;
		width: 200px;
		flex-shrink: 0;
		padding: 2.5rem 1.5rem 2.5rem 0;
	}

	@media (min-width: 1280px) {
		.toc-sidebar {
			display: block;
		}
	}

	.toc-sidebar .toc-label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-text-muted);
		margin-bottom: 0.625rem;
	}

	.toc-sidebar ul {
		list-style: none;
		padding: 0;
		margin: 0;
		position: sticky;
		top: calc(var(--nav-height) + 2rem);
	}

	.toc-sidebar li {
		margin: 0;
	}

	.toc-sidebar li a {
		display: block;
		padding: 0.275rem 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		text-decoration: none;
		border-left: 2px solid transparent;
		padding-left: 0.75rem;
		transition:
			color 0.15s,
			border-color 0.15s;
		line-height: 1.4;
	}

	.toc-sidebar li a:hover {
		color: var(--color-text);
		border-left-color: var(--color-accent);
	}
</style>
