<script>
	// injected at build time from version.json via vite.config.ts define
	const bestVersion = __BEST_VERSION__;

	const gitTag = import.meta.env.VITE_GIT_TAG;
	const isCleanTag = gitTag ? /^spec\/v\d+\.\d+\.\d+$/.test(gitTag) : false;
	const shaMatch = gitTag ? gitTag.match(/-g([0-9a-f]+)$/) : null;
	const tagUrl = isCleanTag
		? `https://github.com/behavioralstate/spec/releases/tag/${gitTag}`
		: shaMatch
			? `https://github.com/behavioralstate/spec/commit/${shaMatch[1]}`
			: null;

	const draft = 'https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/';

	// The smallest complete service: the manifest and one primitive. Kept valid against protocol/v1/schemas/discovery.json.
	const manifest = JSON.stringify(
		{
			best: {
				version: bestVersion,
				services: {
					'com.example.catalogue': {
						description: 'The products example.com sells, and their prices.',
						authentication: { type: 'none' },
						http: { endpoint: 'https://example.com/best' }
					}
				},
				capabilities: [
					{
						name: 'io.best.agents.queries',
						service: 'com.example.catalogue',
						description: 'Products, prices and stock.',
						spec: 'https://behavioralstate.io/specs/agents/queries',
						schema: 'https://behavioralstate.io/v1/schemas/agents/queries.json',
						endpoints: [
							{ method: 'GET', path: '/queries' },
							{ method: 'GET', path: '/queries/{schema}' },
							{ method: 'GET', path: '/queries/{schema}/{version}' }
						]
					}
				]
			}
		},
		null,
		2
	);

	const parts = [
		{
			name: 'Discovery',
			where: 'GET /.well-known/best',
			what: 'Required. The manifest: the services at this name, what each one exposes, and how to sign in.',
			href: '/specs/discovery'
		},
		{
			name: 'Commands',
			where: 'POST /commands',
			what: 'Named requests to change the service. Each is a CloudEvent whose data follows a JSON Schema the service publishes.',
			href: '/specs/agents/commands'
		},
		{
			name: 'Queries',
			where: 'GET /queries/{schema}',
			what: 'Reads of current state, each with declared parameters and a declared response.',
			href: '/specs/agents/queries'
		},
		{
			name: 'Events',
			where: 'GET /events',
			what: 'What happened, as a list, and as a live stream where the manifest declares one. An event caused by a command carries that command’s correlation id.',
			href: '/specs/agents/events'
		},
		{
			name: 'Workflows',
			where: 'GET /workflows',
			what: 'Optional. Published sequences of the operations above, which the client follows step by step.',
			href: '/specs/agents/workflows'
		}
	];

	const software = [
		{
			name: 'best-mcp',
			what: 'Connects an MCP client to any BEST service, and signs the person in.',
			href: 'https://www.npmjs.com/package/@behavioralstate/best-mcp',
			where: 'npm'
		},
		{
			name: 'best-validate',
			what: 'Checks a live endpoint against the conformance list.',
			href: 'https://www.npmjs.com/package/@behavioralstate/best-validate',
			where: 'npm'
		},
		{
			name: 'best',
			what: 'A command line for any BEST service.',
			href: 'https://github.com/behavioralstate/best-cli',
			where: 'GitHub'
		},
		{
			name: 'best-peer',
			what: 'A BEST service in front of GPU machines, written from the specification alone.',
			href: 'https://github.com/behavioralstate/best-peer',
			where: 'GitHub'
		},
		{
			name: 'best-mcu',
			what: 'A BEST service on an ESP32 microcontroller, written from the specification alone.',
			href: 'https://github.com/behavioralstate/best-mcu',
			where: 'GitHub'
		}
	];

	// Services that answer GET /.well-known/best in production. A row is added only for a name that does, and is taken
	// out when it stops: the playground link reads the live manifest, so a dead row shows itself.
	const services = [
		{
			name: 'Sudio',
			what: 'A studio that makes tutorial and marketing videos of web platforms, directed by the person’s agent.',
			host: 'sudio.io'
		},
		{
			name: 'Windlet',
			what: 'A group’s own GPU machines, shared among people who know each other and run by them and their agents.',
			host: 'windlet.io'
		},
		{
			name: 'dotQuant',
			what: 'A trading platform an agent can operate: market data, strategies with backtesting, and orders on the person’s own broker account.',
			host: 'baas.dotquant.io'
		},
		{
			name: 'Remundo',
			what: 'An employer of record: engagements and offers, timesheets, absences, expenses, invoices and payments, for a hiring organisation, its workers and the back office.',
			host: 'api.baas.remundo.com'
		},
		{
			name: 'Belmont Cottage',
			what: 'A self-catering holiday cottage in Whitstable: what it is like, when it is free and at what price, and a request to its owner to book a stay.',
			host: 'belmontcottage.co.uk'
		},
		{
			name: 'NotALemon',
			what: 'An assessment of a used vehicle from its UK registration and the evidence available about it.',
			host: 'notalemon.co.uk',
			// Its manifest sends no CORS header, so a page in a browser cannot read it: the link is the manifest itself.
			direct: true
		}
	];
</script>

<svelte:head>
	<title>BEST: The Behavioral State Protocol</title>
</svelte:head>

<div class="home">
	<article class="page">
		<header class="head">
			<h1>BEST: The Behavioral State Protocol</h1>
			<p class="lead">
				BEST is an open protocol by which a service describes what it does, so that a client that has never seen the
				service can find it and use it. The service publishes a manifest at <code>/.well-known/best</code>. The manifest
				says which of three things the service exposes: commands that change it, queries that read it, and events that
				record what happened.
			</p>
			<p class="meta">
				Version {bestVersion} · Apache 2.0 ·
				<a href={draft} target="_blank" rel="noopener">draft-dinuzzo-best-protocol</a>
				{#if gitTag}
					· build
					{#if tagUrl}<a href={tagUrl} target="_blank" rel="noopener">{gitTag}</a>{:else}{gitTag}{/if}
				{/if}
			</p>
			<p class="links">
				<a href="/specs">Documentation</a>
				<a href="https://github.com/behavioralstate/spec/blob/main/SPEC.md" target="_blank" rel="noopener"
					>The specification in one file</a
				>
				<a href="https://github.com/behavioralstate/spec" target="_blank" rel="noopener">Source</a>
			</p>
		</header>

		<section>
			<h2 id="discovery">Discovery starts from a name</h2>
			<p>
				A client that speaks BEST needs the service’s domain name and nothing else about it. It makes one request over
				HTTPS, with no credential:
			</p>
			<pre><code>GET https://example.com/.well-known/best</code></pre>
			<p>
				The answer is the manifest. This one is a complete BEST service: it has the manifest and one of the three
				primitives, queries that anyone may read.
			</p>
			<pre><code>{manifest}</code></pre>
			<p>
				BEST defines no registry and no directory. The name is a DNS name its operator controls, and a name that does
				not answer with a manifest does not resolve.
			</p>
		</section>

		<section>
			<h2 id="surface">What a service exposes</h2>
			<p>
				The service decides which of commands, queries and events to expose. The manifest and any one of them is enough.
			</p>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Part</th><th>Where</th><th>What it is</th></tr>
					</thead>
					<tbody>
						{#each parts as part}
							<tr>
								<td><a href={part.href}>{part.name}</a></td>
								<td><code>{part.where}</code></td>
								<td>{part.what}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p>
				BEST says nothing about how a service works inside. Storage, execution, retries and the domain model are the
				service’s own.
			</p>
		</section>

		<section>
			<h2 id="sign-in">Signing in</h2>
			<p>
				Where a service lets an agent obtain a credential of its own, its manifest names the two endpoints of the OAuth
				2.0 device authorization grant (<a href="https://www.rfc-editor.org/rfc/rfc8628" target="_blank" rel="noopener">RFC 8628</a>). The agent
				gives the person a link. The person signs in and approves in their own browser, and the agent receives a
				credential of its own. The agent never sees a password. A service that names no such endpoints issues its
				credentials out of band. See
				<a href="/specs/identity-and-registration">Identity and Registration</a>.
			</p>
		</section>

		<section>
			<h2 id="software">Software</h2>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Name</th><th>What it does</th><th>Where</th></tr>
					</thead>
					<tbody>
						{#each software as item}
							<tr>
								<td><code>{item.name}</code></td>
								<td>{item.what}</td>
								<td><a href={item.href} target="_blank" rel="noopener">{item.where}</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p>The <a href="/playground">playground</a> reads a live manifest in the browser.</p>
		</section>

		<section>
			<h2 id="services">Services in production</h2>
			<p>
				These services publish a manifest today. Each name below is all a client needs: the link reads the live
				manifest, in the playground where the service lets a browser read it.
			</p>
			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Service</th><th>What it is</th><th>Name</th></tr>
					</thead>
					<tbody>
						{#each services as service}
							<tr>
								<td>{service.name}</td>
								<td>{service.what}</td>
								<td
									>{#if service.direct}<a href={`https://${service.host}/.well-known/best`} target="_blank" rel="noopener"
											><code>{service.host}</code></a
										>{:else}<a href={`/playground?url=${encodeURIComponent(`https://${service.host}`)}`}
											><code>{service.host}</code></a
										>{/if}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p>
				Sudio, Windlet and dotQuant are run by the specification’s author. Belmont Cottage and NotALemon are
				independent deployments, run by others.
			</p>
		</section>

		<section>
			<h2 id="status">Status</h2>
			<p>
				BEST is published by its author as an open specification and as an individual
				<a href={draft} target="_blank" rel="noopener">Internet-Draft</a>, which is a snapshot of one release and can
				trail this version. It is not an IETF standard, and the
				<code>best</code> well-known suffix is not registered with IANA.
			</p>
			<p>
				What compliance means is in <a href="/specs/conformance">Conformance</a>. Each release says what changed in its
				<a href="https://github.com/behavioralstate/spec/releases" target="_blank" rel="noopener">release notes</a>, and
				what is planned is in the <a href="/roadmap">roadmap</a>.
			</p>
		</section>
	</article>
</div>

<style>
	.home {
		background: #ffffff;
		min-height: calc(100vh - var(--nav-height));
		/* Light, as the docs pages are */
		--color-border: #e2e4f0;
		--color-text: #1e1e3f;
		--color-text-muted: #6b6b8a;
		--color-accent: #4f46e5;
	}

	.page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 3.5rem 1.5rem 5rem;
		color: var(--color-text);
		font-size: 1rem;
		line-height: 1.7;
	}

	.head {
		padding-bottom: 1.75rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	h1 {
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.2;
		color: #111827;
		margin-bottom: 1rem;
	}

	.lead {
		font-size: 1.125rem;
		line-height: 1.65;
		margin-bottom: 1.25rem;
	}

	.meta {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.5rem;
		font-weight: 600;
		margin-bottom: 0;
	}

	h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
		margin-top: 2.75rem;
		margin-bottom: 0.75rem;
		scroll-margin-top: calc(var(--nav-height) + 1.5rem);
	}

	p {
		margin-bottom: 1rem;
	}

	a {
		color: var(--color-accent);
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 2px;
	}

	a:hover {
		text-decoration-thickness: 2px;
	}

	code {
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, 'Cascadia Mono', Consolas, monospace;
		font-size: 0.875em;
	}

	p code,
	td code {
		background: #f1f2f8;
		padding: 0.1em 0.35em;
		border-radius: 4px;
		white-space: nowrap;
	}

	pre {
		background: #f7f7fc;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 1rem 1.25rem;
		margin-bottom: 1rem;
		overflow-x: auto;
		line-height: 1.55;
	}

	pre code {
		font-size: 0.8125rem;
		color: #1e1e3f;
	}

	.table-wrap {
		overflow-x: auto;
		margin-bottom: 1rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9375rem;
	}

	th {
		text-align: left;
		font-weight: 600;
		color: #111827;
		padding: 0.5rem 1rem 0.5rem 0;
		border-bottom: 2px solid var(--color-border);
	}

	td {
		padding: 0.625rem 1rem 0.625rem 0;
		border-bottom: 1px solid var(--color-border);
		vertical-align: top;
	}

	th:last-child,
	td:last-child {
		padding-right: 0;
	}

	/* On a narrow screen a row reads as a short block, not three squeezed columns */
	@media (max-width: 640px) {
		thead {
			display: none;
		}

		table,
		tbody,
		tr,
		td {
			display: block;
		}

		tr {
			padding: 0.75rem 0;
			border-bottom: 1px solid var(--color-border);
		}

		td {
			padding: 0.125rem 0;
			border-bottom: none;
		}

		.page {
			padding: 2.25rem 1.25rem 3.5rem;
		}
	}
</style>
