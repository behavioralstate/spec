<svelte:head>
	<title>Documentation — OAP</title>
</svelte:head>

<div class="index-page">
	<div class="index-header">
		<h1>Documentation</h1>
		<p>The Open Agent Protocol specification — how agents discover each other, exchange events and commands, and observe what happened.</p>
	</div>

	<div class="index-groups">
		<section class="index-group">
			<h2>Getting Started</h2>
			<ul>
				<li><a href="/docs/overview">Protocol Overview</a><span>What OAP is and how it works</span></li>
				<li><a href="/docs/discovery">Discovery</a><span>The <code>/.well-known/oap</code> manifest</span></li>
			</ul>
		</section>

		<section class="index-group">
			<h2>Agents</h2>
			<ul>
				<li><a href="/docs/agents/registry">Registry</a><span>Register, list, and remove agents</span></li>
				<li><a href="/docs/agents/lifecycle">Lifecycle</a><span>Pause and resume agents</span></li>
				<li><a href="/docs/agents/events">Events</a><span>Send events to agents</span></li>
				<li><a href="/docs/agents/commands">Commands</a><span>Observe produced commands</span></li>
				<li><a href="/docs/agents/memory">Memory</a><span>View agent memory state</span></li>
			</ul>
		</section>

		<section class="index-group">
			<h2>Observability</h2>
			<ul>
				<li><a href="/docs/observability/tracing">Tracing</a><span>Execution traces and audit trail</span></li>
			</ul>
		</section>

		<section class="index-group">
			<h2>Transports</h2>
			<ul>
				<li><a href="/docs/transports/rest">REST</a><span>HTTP/JSON API reference</span></li>
				<li><a href="/docs/transports/mcp">MCP</a><span>Model Context Protocol binding</span></li>
				<li><a href="/docs/transports/a2a">A2A</a><span>Agent-to-Agent protocol binding</span></li>
			</ul>
		</section>

		<section class="index-group">
			<h2>Reference</h2>
			<ul>
				<li><a href="/docs/versioning">Versioning</a><span>How versions work</span></li>
				<li><a href="/docs/conformance">Conformance</a><span>What it means to be OAP-compliant</span></li>
			</ul>
		</section>
	</div>
</div>

<style>
	.index-page {
		max-width: 820px;
		padding: 2.5rem 3rem 4rem;
	}

	.index-header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 1.5rem;
		margin-bottom: 2.5rem;
	}

	.index-header h1 {
		font-size: 1.875rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #f0f0ff;
		margin-bottom: 0.5rem;
	}

	.index-header p {
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		max-width: 560px;
	}

	.index-groups {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 2rem;
	}

	.index-group h2 {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: var(--color-text-muted);
		margin-bottom: 0.625rem;
	}

	.index-group ul {
		list-style: none;
		padding: 0;
		margin: 0;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.index-group li {
		border-bottom: 1px solid var(--color-border);
	}

	.index-group li:last-child {
		border-bottom: none;
	}

	.index-group li a {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text);
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}

	.index-group li a:hover {
		background: rgba(99, 102, 241, 0.07);
		color: var(--color-accent-hover);
	}

	.index-group li span {
		font-size: 0.78125rem;
		color: var(--color-text-muted);
		font-weight: 400;
		text-align: right;
		flex-shrink: 0;
	}
</style>

