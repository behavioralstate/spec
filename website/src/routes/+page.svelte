<script>
	import Hero from '$lib/components/Hero.svelte';
	import FeatureCard from '$lib/components/FeatureCard.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
</script>

<svelte:head>
	<title>OAP — Open Agent Protocol</title>
</svelte:head>

<!-- Hero -->
<Hero />

<!-- Features -->
<section id="features" class="features-section">
	<div class="max-w-6xl mx-auto">
		<p class="section-eyebrow">Capabilities</p>
		<h2 class="section-title">Built for agent interoperability</h2>
		<p class="section-subtitle">
			OAP defines composable capabilities that any agent can expose and any consumer can discover — over REST, MCP, or A2A.
		</p>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<FeatureCard
				icon="📋"
				title="Service Registry"
				description="Register, discover, and manage services with a standard descriptor format."
			/>
			<FeatureCard
				icon="⚡"
				title="Command Ingestion"
				description="POST commands as CloudEvents to the single ingestion endpoint. Validated against the dataschema and queued asynchronously."
			/>
			<FeatureCard
				icon="🎯"
				title="Command Catalogue"
				description="GET /commands returns all available command types and their schema URIs — discoverable at runtime by any caller."
			/>
			<FeatureCard
				icon="🔍"
				title="Execution Traces"
				description="Full observability: what command went in, what events came out, how long it took."
			/>
			<FeatureCard
				icon="🌐"
				title="Discovery"
				description="/.well-known/oap — any consumer hits one URL and learns everything."
			/>
			<FeatureCard
				icon="🔌"
				title="Transport Agnostic"
				description="REST for web UIs, MCP for LLMs, A2A for agent-to-agent coordination."
			/>
		</div>
	</div>
</section>

<!-- See it in action -->
<section id="example" class="example-section">
	<div class="max-w-6xl mx-auto">
		<p class="section-eyebrow">See it in action</p>
		<h2 class="section-title">Discovery manifest</h2>
		<p class="section-subtitle">
			Every OAP endpoint exposes a <code class="code-inline">/.well-known/oap</code> manifest. Consumers discover agents, capabilities, and transports in a single request.
		</p>
		<CodeBlock code={`{
  "oap": {
    "version": "2026-04-10",
    "services": {
      "io.oap.agents": {
        "version": "2026-04-10",
        "description": "Service registry, command ingestion, event log",
        "rest": {
          "openapi": "https://openagentprotocol.io/v1/services/agents/openapi.json",
          "endpoint": "https://api.example.com/"
        }
      }
    },
    "capabilities": [
      {
        "name": "io.oap.agents.commands",
        "version": "2026-04-10",
        "description": "Command catalogue and ingestion",
        "spec": "https://openagentprotocol.io/specs/agents/commands",
        "schema": "https://openagentprotocol.io/v1/schemas/agents/commands.json"
      }
    ],
    "services": [
      {
        "id": "negotiation",
        "name": "Contract Negotiation",
        "accepts": ["ProposeCounter", "AcceptContract"],
        "produces": ["CounterProposed", "ContractAccepted"],
        "status": "running"
      }
    ]
  }
}`} />
	</div>
</section>

<!-- For whom -->
<section id="audience" class="features-section">
	<div class="max-w-6xl mx-auto">
		<p class="section-eyebrow">Designed for everyone</p>
		<h2 class="section-title">Who is OAP for?</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			<div class="audience-card">
				<h3>For Developers</h3>
				<p>Build CQRS + Event Sourcing services on an open foundation. JSON Schema definitions, OpenAPI specs, and transport bindings — everything you need to implement OAP.</p>
			</div>
			<div class="audience-card">
				<h3>For Businesses</h3>
				<p>Expose your services to any agent in the world. No bespoke integrations — just a manifest describing what you accept and produce.</p>
			</div>
			<div class="audience-card">
				<h3>For AI Platforms</h3>
				<p>Discover and interact with any OAP-compliant agent using MCP, A2A, or simple REST. Compatible with existing agent frameworks.</p>
			</div>
			<div class="audience-card">
				<h3>For IoT &amp; Sensors</h3>
				<p>Even a temperature sensor can be an OAP service — it accepts commands and publishes events, and any caller can discover it via the manifest.</p>
			</div>
		</div>
	</div>
</section>

<!-- CTA -->
<section class="cta-section">
	<div class="max-w-4xl mx-auto text-center">
		<h2 class="section-title">Get started today</h2>
		<p class="section-subtitle mx-auto">
			OAP is open-source under Apache 2.0. Explore the spec, read the schemas, and start building.
		</p>
		<div class="cta-actions">
			<a href="/docs" class="btn-primary">Read the docs</a>
			<a href="https://github.com/openagentprotocol/spec" target="_blank" rel="noopener" class="btn-secondary">View on GitHub</a>
		</div>
	</div>
</section>

<style>
	/* Shared section utilities */
	.features-section, .example-section, .cta-section {
		padding: 6rem 1.5rem;
	}

	.features-section {
		background: #060912;
	}

	.example-section {
		background: #060912;
	}

	.cta-section {
		background: #0a0e1a;
		text-align: center;
	}

	.section-eyebrow {
		color: #3b82f6;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}

	.section-title {
		color: #ffffff;
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-bottom: 1rem;
	}

	.section-subtitle {
		color: #94a3b8;
		font-size: 1rem;
		line-height: 1.7;
		max-width: 42rem;
		margin-bottom: 3.5rem;
	}

	.code-inline {
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
		font-size: 0.875em;
		color: #60a5fa;
		background: rgba(59, 130, 246, 0.1);
		padding: 0.1em 0.4em;
		border-radius: 4px;
	}

	/* Audience cards */
	.audience-card {
		padding: 1.5rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: #111827;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.audience-card:hover {
		border-color: rgba(59, 130, 246, 0.3);
		box-shadow: 0 0 60px rgba(59, 130, 246, 0.15);
	}

	.audience-card h3 {
		color: #ffffff;
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 0.625rem;
	}

	.audience-card p {
		color: #94a3b8;
		font-size: 0.9375rem;
		line-height: 1.6;
		margin: 0;
	}

	/* CTA actions */
	.cta-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		margin-top: 2rem;
	}

	.btn-primary {
		padding: 0.75rem 2rem;
		border-radius: 8px;
		background: #3b82f6;
		color: #ffffff;
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		transition: background 0.15s;
	}

	.btn-primary:hover { background: #60a5fa; }

	.btn-secondary {
		padding: 0.75rem 2rem;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: #e2e8f0;
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-secondary:hover {
		border-color: #3b82f6;
		color: #ffffff;
	}
</style>
