<script>
	import Hero from '$lib/components/Hero.svelte';
	import FeatureCard from '$lib/components/FeatureCard.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';

	const cloudEventsSvg = `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="-2.78 54.22 365.56 245.56"><style>.st0{fill:#4dcef3}</style><g><g transform="translate(48 69)"><path d="M219.246 198.341c26.572.001 55.443-17.497 61.933-43.466 7.451-29.82-10.013-60.551-39.311-69.135-5.606-1.642-11.362-2.176-17.184-2.167-8.557.014-17.114.004-25.902.004.598-21.86-7.116-39.902-24.405-53.336-11.024-8.567-23.716-12.575-37.607-12.128-15.736.506-29.325 6.452-40.487 17.65C85.15 46.93 79.339 60.593 78.286 76.006l-24.08-8.315C56.35 41.089 77.846 4.345 119.513-5.3c47.529-11.003 91.576 20.022 101.913 63.662 3.951 0 8.061-.389 12.077.062C265.767 62.043 288.65 79 301.405 108.81c15.76 36.835 2.371 80.218-30.54 101.795-13.68 8.97-35.278 13.358-51.556 13.395" class="st0"/><path d="M200.15 223.85s-39.04.289-71.17.065c-33.79-.235-61.053-21.921-69.473-51.402-7.312-25.6-1.444-48.533 16.123-68.474 11.178-12.687 25.044-20.82 41.818-23.711 28.282-4.876 56.748 7.754 71.982 32.01 9.835 15.659 13.52 32.685 10.882 51.03-.165 1.148-.433 1.757-1.794 1.754-22.819-.038-45.637-.028-68.456-.034-.321 0-.642-.07-1.134-.127-.04-.686-.107-1.324-.108-1.964-.007-7.032-.008-14.065-.002-21.098.002-2.854.314-3.152 3.222-3.152h41.219c-.363-1.13-.584-2.07-.956-2.944-6.755-15.885-18.64-25.76-35.647-28.59-17.05-2.84-31.939 2.207-43.14 15.521-17.225 20.476-11.832 53.086 10.776 67.821 7.787 5.076 16.3 7.596 25.617 7.587 31.8-.032 70.178-.007 70.178-.007l.064 25.714" class="st0"/><path d="M45.066 192.514l15.765 19.942c-21.782 13.708-58.5 14.24-84.102-11.702-25.844-26.188-27.453-68.227-3.54-96.512 24.25-28.684 62.787-30.793 87.695-15.67l-15.817 19.964c-12.315-5.34-25.212-5.522-37.968.524-8.575 4.065-15.198 10.361-19.893 18.657-9.72 17.178-7.545 38.47 5.433 53.303 12.337 14.1 32.984 20.15 52.427 11.494" class="st0"/></g></g></svg>`;
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
				icon="🌐"
				title="Discovery"
				description="/.well-known/oap — any consumer hits one URL and learns everything."
			/>
			<FeatureCard
				icon="⚡"
				title="Commands"
				description="GET /commands returns every accepted command type with its versioned schema URI. POST a CloudEvent to ingest — validated and queued asynchronously."
			/>
			<FeatureCard
				icon="📡"
				title="Events"
				description="GET /events exposes what a service has published — filterable by type or correlation ID. Push delivery via webhook, MCP notification, or A2A message."
			/>
			<FeatureCard
				logoSvg={cloudEventsSvg}
				title="CloudEvents Wire Format"
				description="Commands and events both use the CloudEvents 1.0 spec — a CNCF standard for describing event data in a common way, with SDKs across every major language."
			/>
			<FeatureCard
				icon="🌡️"
				title="IoT & Edge"
				description="A fridge, a sensor, a smart building controller. An OAP edge gateway exposes any connected device as a discoverable service — any agent commands it, any caller reads its events."
			/>
			<FeatureCard
				icon="🤝"
				title="Human-in-the-Loop"
				description="A freelance translator, a legal review, an approval workflow. If it accepts a request and produces a result, it's an OAP service — no AI required behind the curtain."
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
        "description": "Service registry, command ingestion, published events",
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
				<p>Build command-and-event services on an open foundation. JSON Schema definitions, OpenAPI specs, and transport bindings — everything you need to implement OAP.</p>
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
