<svelte:head>
	<title>Documentation — OAP</title>
</svelte:head>

<div class="index-page">
	<div class="index-header">
		<h1>Documentation</h1>
		<p>Open Agent Protocol — a standard interaction surface so any caller can send commands to any service, and any observer can consume the events it produces.</p>
	</div>

	<!-- Flow diagram — analogous to dotQuant's TradingView → Bridge → Brokers -->
	<div class="flow-diagram">
		<div class="flow-node">
			<div class="node-title">Caller</div>
			<div class="node-box">Any Caller</div>
			<div class="node-sub">app · agent · IoT · human</div>
		</div>

		<div class="flow-arrow">
			<div class="arrow-label">Command</div>
			<div class="arrow-track"><span class="arrow-head">→</span></div>
		</div>

		<div class="flow-node">
			<div class="node-title">OAP Endpoint</div>
			<div class="node-box node-box--brand">Your Implementation</div>
			<div class="node-sub">/.well-known/oap</div>
		</div>

		<div class="flow-arrow">
			<div class="arrow-label">Event</div>
			<div class="arrow-track"><span class="arrow-head">→</span></div>
		</div>

		<div class="flow-node">
			<div class="node-title">Consumer</div>
			<div class="node-box">Any Agent</div>
			<div class="node-sub">LLM · app · UI · agent</div>
		</div>
	</div>

	<!-- How it works — 3 implementation steps -->
	<div class="steps">
		<div class="step">
			<span class="step-num">1</span>
			<div class="step-body">
				<strong>Expose <code>/.well-known/oap</code></strong>
				<p>Serve a discovery manifest describing your agents, capabilities, and transport bindings. Consumers read it once and know everything.</p>
			</div>
		</div>
		<div class="step">
			<span class="step-num">2</span>
			<div class="step-body">
				<strong>Accept commands, produce events</strong>
				<p>Callers POST commands to your service. Your service processes them (any way it likes) and the events it produces are observable via the REST or MCP API.</p>
			</div>
		</div>
		<div class="step">
			<span class="step-num">3</span>
			<div class="step-body">
				<strong>Observe every execution</strong>
				<p>Every command→event cycle is stored as an execution trace — input, output, duration, and success — giving you a full audit trail.</p>
			</div>
		</div>
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
				<li><a href="/docs/agents/events">Events</a><span>Events published by services</span></li>
				<li><a href="/docs/agents/commands">Commands</a><span>Accept and catalogue commands</span></li>
				<li><a href="/docs/agents/queries">Queries</a><span>Synchronous reads of current state</span></li>
				<li><a href="/docs/agents/memory">Memory</a><span>View agent memory state</span></li>
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
				<li><a href="/docs/design-decisions">Design Decisions</a><span>Why OAP is shaped the way it is</span></li>
			</ul>
		</section>

		<section class="index-group">
			<h2>Comparisons</h2>
			<ul>
				<li><a href="/docs/comparisons/ucp">OAP vs UCP</a><span>How OAP relates to Google's Universal Commerce Protocol</span></li>
			</ul>
		</section>
	</div>
</div>

<style>
	.index-page {
		max-width: 860px;
		padding: 2.5rem 3rem 4rem;
	}

	@media (max-width: 767px) {
		.index-page {
			padding: 1.75rem 1.25rem 3rem;
		}

		.index-groups {
			grid-template-columns: 1fr;
		}
	}

	/* ── Header ──────────────────────────────────────── */
	.index-header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 1.5rem;
		margin-bottom: 2rem;
	}

	.index-header h1 {
		font-size: 1.875rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #111827;
		margin-bottom: 0.5rem;
	}

	.index-header p {
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		line-height: 1.6;
		max-width: 580px;
	}

	/* ── Flow diagram ────────────────────────────────── */
	.flow-diagram {
		display: flex;
		align-items: center;
		gap: 0;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		padding: 1.75rem 2rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.flow-node {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		min-width: 130px;
	}

	.node-title {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.node-box {
		padding: 0.6rem 1.25rem;
		border: 1.5px solid var(--color-border);
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		background: #ffffff;
		text-align: center;
		white-space: nowrap;
	}

	.node-box--brand {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: #ffffff;
		box-shadow: 0 2px 12px rgba(79, 70, 229, 0.3);
	}

	.node-sub {
		font-size: 0.71875rem;
		color: var(--color-text-muted);
		text-align: center;
	}

	.flow-arrow {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.25rem;
	}

	.arrow-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-accent);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.arrow-track {
		display: flex;
		align-items: center;
	}

	.arrow-head {
		font-size: 1.25rem;
		color: var(--color-border);
		line-height: 1;
	}

	@media (max-width: 600px) {
		.flow-diagram {
			flex-direction: column;
			padding: 1.25rem 1.25rem;
		}

		.flow-arrow {
			transform: rotate(90deg);
		}
	}

	/* ── How it works steps ──────────────────────────── */
	.steps {
		display: flex;
		flex-direction: column;
		gap: 0;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		overflow: hidden;
		margin-bottom: 2.5rem;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 1.25rem;
		padding: 1.125rem 1.375rem;
		border-bottom: 1px solid var(--color-border);
		background: #ffffff;
	}

	.step:last-child {
		border-bottom: none;
	}

	.step-num {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--color-accent);
		color: #ffffff;
		font-size: 0.8125rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.1rem;
	}

	.step-body {
		flex: 1;
	}

	.step-body strong {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: 0.25rem;
	}

	.step-body code {
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
		font-size: 0.8125em;
		background: rgba(79, 70, 229, 0.08);
		color: var(--color-accent);
		padding: 0.1em 0.4em;
		border-radius: 4px;
		border: 1px solid rgba(79, 70, 229, 0.18);
	}

	.step-body p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-muted);
		line-height: 1.55;
	}

	/* ── Nav groups grid ─────────────────────────────── */
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
		background: rgba(79, 70, 229, 0.06);
		color: var(--color-accent);
	}

	.index-group li span {
		font-size: 0.78125rem;
		color: var(--color-text-muted);
		font-weight: 400;
		text-align: right;
		flex-shrink: 0;
	}
</style>

