<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.title} — BSP</title>
</svelte:head>

<div class="page-wrapper">
	<article class="page-content">
		<!-- Breadcrumb -->
		{#if data.breadcrumb.length > 0}
			<nav class="breadcrumb" aria-label="Breadcrumb">
				<a href="/docs">Docs</a>
				{#each data.breadcrumb as crumb}
					<span class="sep" aria-hidden="true">/</span>
					<span>{crumb.label}</span>
				{/each}
			</nav>
		{:else}
			<nav class="breadcrumb" aria-label="Breadcrumb">
				<a href="/docs">Docs</a>
			</nav>
		{/if}

		<div class="docs-content">
			{@html data.html}
		</div>
	</article>

	<!-- Right-side TOC, shown when there are headings -->
	{#if data.headings.length > 1}
		<aside class="toc-sidebar">
			<p class="toc-label">On this page</p>
			<ul>
				{#each data.headings as h}
					<li class:toc-h3={h.level === 3}>
						<a href="#{h.id}">{h.text}</a>
					</li>
				{/each}
			</ul>
		</aside>
	{/if}
</div>

<style>
	.page-wrapper {
		display: flex;
		align-items: flex-start;
		gap: 0;
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

	/* Breadcrumb */
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin-bottom: 1.75rem;
	}

	.breadcrumb a {
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color 0.15s;
	}

	.breadcrumb a:hover {
		color: var(--color-text);
	}

	.sep {
		color: var(--color-border);
		user-select: none;
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
		transition: color 0.15s, border-color 0.15s;
		line-height: 1.4;
	}

	.toc-sidebar li.toc-h3 a {
		padding-left: 1.375rem;
		font-size: 0.78125rem;
	}

	.toc-sidebar li a:hover {
		color: var(--color-text);
		border-left-color: var(--color-accent);
	}
</style>

