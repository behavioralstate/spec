<script lang="ts">
	import { page } from '$app/state';

	const nav = [
		{
			label: 'Getting Started',
			items: [
				{ label: 'Overview', href: '/docs/overview' },
				{ label: 'Discovery', href: '/docs/discovery' }
			]
		},
		{
			label: 'Agents',
			items: [
				{ label: 'Registry', href: '/docs/agents/registry' },
				{ label: 'Lifecycle', href: '/docs/agents/lifecycle' },
				{ label: 'Events', href: '/docs/agents/events' },
				{ label: 'Commands', href: '/docs/agents/commands' },
				{ label: 'Memory', href: '/docs/agents/memory' }
			]
		},
		{
			label: 'Observability',
			items: [{ label: 'Tracing', href: '/docs/observability/tracing' }]
		},
		{
			label: 'Transports',
			items: [
				{ label: 'REST', href: '/docs/transports/rest' },
				{ label: 'MCP', href: '/docs/transports/mcp' },
				{ label: 'A2A', href: '/docs/transports/a2a' }
			]
		},
		{
			label: 'Reference',
			items: [
				{ label: 'Versioning', href: '/docs/versioning' },
				{ label: 'Conformance', href: '/docs/conformance' }
			]
		}
	];

	function isActive(href: string) {
		return page.url.pathname === href;
	}
</script>

<nav class="sidebar">
	<div class="sidebar-inner">
		<a href="/docs" class="sidebar-home" class:active={page.url.pathname === '/docs'}>
			All Docs
		</a>

		{#each nav as group}
			<div class="nav-group">
				<p class="nav-group-label">{group.label}</p>
				<ul>
					{#each group.items as item}
						<li>
							<a href={item.href} class="nav-item" class:active={isActive(item.href)}>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</nav>

<style>
	.sidebar {
		width: 252px;
		flex-shrink: 0;
		border-right: 1px solid var(--color-border);
		background: var(--color-bg);
	}

	.sidebar-inner {
		position: sticky;
		top: var(--nav-height);
		height: calc(100vh - var(--nav-height));
		overflow-y: auto;
		padding: 1.5rem 0 3rem;
		scrollbar-width: thin;
		scrollbar-color: var(--color-border) transparent;
	}

	.sidebar-inner::-webkit-scrollbar {
		width: 4px;
	}
	.sidebar-inner::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 2px;
	}

	.sidebar-home {
		display: block;
		margin: 0 0.75rem 1.25rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		border-radius: 5px;
		transition: color 0.15s, background 0.15s;
		text-decoration: none;
	}

	.sidebar-home:hover {
		color: var(--color-text);
		background: rgba(255, 255, 255, 0.04);
	}

	.sidebar-home.active {
		color: var(--color-accent);
	}

	.nav-group {
		margin-bottom: 1.75rem;
		padding: 0 0.75rem;
	}

	.nav-group-label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-text-muted);
		padding: 0 0.75rem;
		margin-bottom: 0.375rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.nav-item {
		display: block;
		padding: 0.35rem 0.75rem;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		border-radius: 5px;
		text-decoration: none;
		transition: color 0.15s, background 0.15s;
		line-height: 1.4;
	}

	.nav-item:hover {
		color: var(--color-text);
		background: rgba(255, 255, 255, 0.04);
	}

	.nav-item.active {
		color: var(--color-accent-hover);
		background: rgba(99, 102, 241, 0.1);
		font-weight: 500;
	}
</style>
