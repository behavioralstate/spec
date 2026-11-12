<script>
	import { onMount, onDestroy } from 'svelte';

	let baseUrl = $state('');
	let discovering = $state(false);
	let discoverError = $state('');
	let manifest = $state(null);
	// Root (global) manifest, kept when a tenant manifest replaces `manifest`
	// so the tenant strip stays available for switching tenants.
	let rootManifest = $state(null);
	// True while `manifest` is a tenant manifest rather than the root one
	let onTenantManifest = $state(false);

	let activeMethod = $state('');
	let activePath = $state('');
	let activeEndpointBase = $state('');
	let activeDescription = $state('');

	let requestBody = $state('');
	let responseText = $state('');
	let responseStatus = $state(null);
	let responseLoading = $state(false);
	let responseError = $state('');

	let commandCatalogue = $state([]);
	let selectedCommandType = $state('');

	// Credential supplied by the user for authenticated endpoints
	let credential = $state('');

	// Tenant ID for multi-tenant manifests (two-step discovery)
	let tenantId = $state('');
	let tenantDiscovering = $state(false);
	let tenantError = $state('');

	// Sign-in by the device flow (RFC 8628; SPEC.md, Agent Registration). The credential
	// lives in `credential`, in this page's memory only: it is never shown, logged or put
	// in the address bar, and the token answer that carries it is never displayed.
	let signIn = $state(null); // while waiting: { userCode, link, expiresAt }
	let signInError = $state('');
	let signedIn = $state(null); // after approval: { name, tenantId, header }
	let manualCredential = $state(false);
	let pollTimer = null;
	let signInRun = 0;

	// Path parameters extracted from the active path template, e.g. { tenantId: '' }
	let pathParams = $state({});

	let normalizedBase = $derived(baseUrl.replace(/\/+$/, ''));
	let capabilities = $derived(manifest?.capabilities ?? []);
	// `services` is an object keyed by service id. Older drafts shipped an agent
	// snapshot array under "services"; that snapshot now lives under "agents".
	let serviceEntries = $derived(
		manifest?.services && !Array.isArray(manifest.services) ? Object.entries(manifest.services) : []
	);
	let agents = $derived(
		manifest?.agents ?? (Array.isArray(manifest?.services) ? manifest.services : [])
	);
	let auth = $derived(manifest?.authentication ?? null);
	let needsAuth = $derived(auth && auth.type !== 'none');

	// Tenant discovery template advertised by the root manifest
	let tenantTemplate = $derived(rootManifest?.tenants?.manifest ?? null);
	let needsTenant = $derived(tenantTemplate !== null);

	// Sign-in is declared on the root manifest's authentication block
	let rootAuth = $derived(rootManifest?.authentication ?? null);
	let canSignIn = $derived(!!(rootAuth?.deviceAuthorizationUrl && rootAuth?.tokenUrl));
	let showCredentialInput = $derived(!signedIn && (manualCredential || !canSignIn));
	let showTenantInput = $derived(
		needsTenant && (signedIn ? !signedIn.tenantId : manualCredential || !canSignIn)
	);

	// Each service with the capabilities that belong to it, so a capability is read
	// under its service and two services' same-named capabilities are told apart.
	let groupedServices = $derived(
		serviceEntries.map(([id, svc]) => ({
			id,
			svc,
			caps: capabilities.filter((cap) => capServiceKey(cap) === id)
		}))
	);
	let ungroupedCaps = $derived(
		capabilities.filter((cap) => !serviceEntries.some(([id]) => id === capServiceKey(cap)))
	);

	// Active path with {param} tokens replaced by user-supplied values
	let resolvedPath = $derived(
		activePath.replace(/\{([^}]+)\}/g, (_, name) => pathParams[name] || `{${name}}`)
	);

	// True when the path has unresolved {param} tokens (user hasn't filled them yet)
	let hasUnresolvedParams = $derived(/\{[^}]+\}/.test(resolvedPath));

	let isPostCommands = $derived(activeMethod === 'POST' && !hasUnresolvedParams && activePath.endsWith('/commands'));

	// Auto-populate the CloudEvent template whenever POST /commands becomes reachable
	// (covers the case where the user fills in path params after selecting the endpoint)
	$effect(() => {
		if (isPostCommands && requestBody === '') {
			if (commandCatalogue.length === 0) {
				loadCommandCatalogue().then(() => buildCommandTemplate());
			} else {
				buildCommandTemplate();
			}
		}
	});

	// Build the Authorization / API-key header value from the declared scheme and the
	// credential the user typed. Returns an object to spread into fetch headers.
	function authHeaders() {
		if (!credential) return {};
		// A credential from the device flow goes in the header its token answer named
		if (signedIn) {
			return signedIn.header ? { [signedIn.header]: credential } : { Authorization: `Bearer ${credential}` };
		}
		if (!needsAuth) return {};
		if (auth.type === 'bearer') {
			const scheme = auth.scheme ?? 'Bearer';
			return { Authorization: `${scheme} ${credential}` };
		}
		if (auth.type === 'apiKey') {
			const headerName = auth.scheme ?? 'X-Api-Key';
			return { [headerName]: credential };
		}
		if (auth.type === 'oauth2') {
			return { Authorization: `Bearer ${credential}` };
		}
		return {};
	}

	// Resolve the REST base URL for a capability.
	// Use cap.service, or the service whose key prefixes the capability's name when the
	// field is absent (SPEC.md, Agent Navigation Guide), to look up its http.endpoint.
	// Fall back to the URL-bar value if neither names a service with an endpoint.
	function capServiceKey(cap) {
		const services = manifest?.services && !Array.isArray(manifest.services) ? manifest.services : {};
		return (
			cap?.service ??
			Object.keys(services)
				.filter((k) => cap?.name === k || cap?.name?.startsWith(`${k}.`))
				.sort((a, b) => b.length - a.length)[0]
		);
	}

	function resolveEndpointBase(cap) {
		const key = capServiceKey(cap);
		const endpoint = key ? manifest?.services?.[key]?.http?.endpoint : null;
		return endpoint ? endpoint.replace(/\/+$/, '') : normalizedBase;
	}

	// How a service is reached: public, by the platform's sign-in, or by a credential
	// of its own kind (a share's token) that the root sign-in does not give.
	function serviceAccess(svc) {
		const own = svc?.authentication;
		const type = (own ?? manifest?.authentication)?.type;
		if (!type || type === 'none') return { label: 'public', kind: 'public' };
		if (own && manifest?.authentication && own.type !== manifest.authentication.type) {
			return { label: own.type === 'bearer' ? 'own token' : own.type, kind: 'other' };
		}
		return { label: 'sign-in', kind: 'signin' };
	}

	async function postForm(url, fields) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
			body: new URLSearchParams(fields)
		});
		const json = await res.json().catch(() => ({}));
		return { res, json };
	}

	function stopSignIn() {
		signInRun++;
		clearTimeout(pollTimer);
		pollTimer = null;
		signIn = null;
	}

	async function startSignIn() {
		stopSignIn();
		signInError = '';
		const run = signInRun;
		try {
			const { res, json } = await postForm(rootAuth.deviceAuthorizationUrl, {
				client_id: 'best-playground',
				agent_label: 'The BEST Playground in this browser',
				credential_lifetime: 'session'
			});
			if (run !== signInRun) return;
			if (!res.ok || !json.device_code) {
				throw new Error(json.error_description ?? json.error ?? `HTTP ${res.status}`);
			}
			signIn = {
				userCode: json.user_code ?? '',
				link: json.verification_uri_complete ?? json.verification_uri,
				expiresAt: Date.now() + (json.expires_in ?? 900) * 1000
			};
			// The device code is a secret until redeemed: it stays in this closure.
			pollToken(run, json.device_code, Math.max(1, Number(json.interval) || 5));
		} catch (e) {
			if (run === signInRun) signInError = `Sign-in could not start: ${e.message}`;
		}
	}

	function pollToken(run, deviceCode, interval) {
		pollTimer = setTimeout(async () => {
			if (run !== signInRun || !signIn) return;
			if (Date.now() > signIn.expiresAt) {
				signInError = 'The code expired before it was approved. Sign in again.';
				signIn = null;
				return;
			}
			try {
				const { res, json } = await postForm(rootAuth.tokenUrl, {
					grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
					device_code: deviceCode,
					client_id: 'best-playground'
				});
				if (run !== signInRun) return;
				if (res.ok && json.access_token) return await finishSignIn(json);
				if (json.error === 'authorization_pending') return pollToken(run, deviceCode, interval);
				if (json.error === 'slow_down') return pollToken(run, deviceCode, interval + 5);
				throw new Error(
					json.error === 'access_denied'
						? 'The sign-in was refused.'
						: json.error === 'expired_token'
							? 'The code expired before it was approved. Sign in again.'
							: (json.error_description ?? json.error ?? `HTTP ${res.status}`)
				);
			} catch (e) {
				if (run !== signInRun) return;
				signInError = e.message;
				signIn = null;
			}
		}, interval * 1000);
	}

	async function finishSignIn(answer) {
		const bearer = String(answer.token_type ?? '').toLowerCase() === 'bearer';
		credential = answer.access_token;
		signedIn = {
			name: answer.name ?? '',
			tenantId: answer.tenant_id ?? '',
			header: answer.auth_header ?? (bearer ? null : (rootAuth?.scheme ?? 'X-Api-Key'))
		};
		signIn = null;
		manualCredential = false;
		if (signedIn.tenantId && tenantTemplate) {
			tenantId = signedIn.tenantId;
			await loadTenantManifest();
		}
	}

	// Signing out forgets the credential and starts again from the root manifest.
	// The credential itself is not revoked: a session credential runs out on its own.
	function signOut() {
		discover();
	}

	onDestroy(stopSignIn);

	// Accept both the canonical lowercase "best" envelope and the legacy
	// uppercase "BEST" casing emitted by pre-erratum implementations.
	function unwrapManifest(json) {
		return json?.best ?? json?.BEST ?? json;
	}

	function assertManifest(m) {
		if (!m || typeof m !== 'object' || !(m.version || m.capabilities || m.services || m.tenants)) {
			throw new Error('Response does not look like a BEST manifest (expected a "best" root object).');
		}
	}

	// Keep the address bar shareable: /playground?url=<base>&tenant=<id>
	function syncQueryString() {
		const qs = new URLSearchParams();
		if (normalizedBase) qs.set('url', normalizedBase);
		if (tenantId) qs.set('tenant', tenantId);
		history.replaceState(null, '', qs.size > 0 ? `?${qs.toString()}` : location.pathname);
	}

	async function loadTenantManifest() {
		if (!tenantId || !tenantTemplate) return;
		tenantDiscovering = true;
		tenantError = '';
		responseText = '';
		responseStatus = null;
		responseError = '';
		try {
			const url = tenantTemplate.replace('{tenantId}', encodeURIComponent(tenantId));
			const res = await fetch(url, {
				headers: { Accept: 'application/json', ...authHeaders() }
			});
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
			const json = await res.json();
			const unwrapped = unwrapManifest(json);
			assertManifest(unwrapped);
			manifest = unwrapped;
			onTenantManifest = true;
			responseText = JSON.stringify(json, null, 2);
			responseStatus = res.status;
			activeMethod = 'GET';
			activePath = `/.well-known/best/${tenantId}`;
			activeEndpointBase = normalizedBase;
			activeDescription = `Tenant manifest (${tenantId})`;
			syncQueryString();
		} catch (e) {
			tenantError = e.message;
		} finally {
			tenantDiscovering = false;
		}
	}

	async function discover() {
		discovering = true;
		discoverError = '';
		manifest = null;
		rootManifest = null;
		onTenantManifest = false;
		responseText = '';
		responseStatus = null;
		responseError = '';
		commandCatalogue = [];
		selectedCommandType = '';
		activeMethod = '';
		activePath = '';
		activeEndpointBase = '';
		credential = '';
		tenantId = '';
		tenantError = '';
		stopSignIn();
		signedIn = null;
		signInError = '';
		manualCredential = false;
		try {
			// Accept a bare base URL, a full /.well-known/best URL, or a tenant
			// manifest URL (/.well-known/best/{tenantId}) pasted straight in.
			const match = normalizedBase.match(/^(.*?)\/\.well-known\/best(?:\/([^/?#]+))?$/);
			const base = match ? match[1] : normalizedBase;
			const tenantFromUrl = match?.[2] ? decodeURIComponent(match[2]) : '';
			if (match) baseUrl = base;

			const res = await fetch(`${base}/.well-known/best`);
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
			const json = await res.json();
			const unwrapped = unwrapManifest(json);
			assertManifest(unwrapped);
			rootManifest = unwrapped;
			manifest = unwrapped;
			responseText = JSON.stringify(json, null, 2);
			responseStatus = res.status;
			activeMethod = 'GET';
			activePath = '/.well-known/best';
			activeEndpointBase = base;
			activeDescription = 'Discovery manifest';
			syncQueryString();

			if (tenantFromUrl) {
				tenantId = tenantFromUrl;
				await loadTenantManifest();
			}
		} catch (e) {
			discoverError = e.message;
		} finally {
			discovering = false;
		}
	}

	// Deep link: /playground?url=<base-or-manifest-url>&tenant=<id>
	onMount(() => {
		const params = new URLSearchParams(location.search);
		const url = params.get('url');
		const tenant = params.get('tenant');
		if (!url) return;
		baseUrl = tenant ? `${url.replace(/\/+$/, '')}/.well-known/best/${tenant}` : url;
		discover();
	});

	async function selectEndpoint(method, path, description, endpointBase) {
		activeMethod = method;
		activePath = path;
		activeEndpointBase = endpointBase ?? normalizedBase;
		activeDescription = description;
		responseText = '';
		responseStatus = null;
		responseError = '';
		requestBody = '';

		// Extract path parameters from the template, preserving any values already typed
		const paramNames = [...path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
		pathParams = Object.fromEntries(paramNames.map(n => [n, pathParams[n] ?? '']));

		// Don't auto-fire if the path has parameters that need filling in
		if (paramNames.length > 0) return;

		if (method === 'GET') {
			await callEndpoint();
		} else if (method === 'POST' && path.endsWith('/commands')) {
			if (commandCatalogue.length === 0) await loadCommandCatalogue();
			buildCommandTemplate();
		} else {
			requestBody = '{\n  \n}';
		}
	}

	async function loadCommandCatalogue() {
		try {
			const res = await fetch(`${activeEndpointBase}${resolvedPath.replace(/\/commands.*/, '/commands')}`, {
				headers: { Accept: 'application/json', ...authHeaders() }
			});
			if (!res.ok) return;
			const json = await res.json();
			commandCatalogue = json.commands ?? [];
			if (commandCatalogue.length > 0) selectedCommandType = commandCatalogue[0].schema;
		} catch { /* silently fail */ }
	}

	// Convert kebab-case catalogue schema name to PascalCase CloudEvent type
	// e.g. 'propose-counter' → 'ProposeCounter'
	function schemaToCloudEventType(schema) {
		if (!schema) return 'YourCommandType';
		return schema.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
	}

	function buildCommandTemplate() {
		const found = commandCatalogue.find((c) => c.schema === selectedCommandType);
		const cloudEventType = schemaToCloudEventType(found?.schema ?? selectedCommandType);
		requestBody = JSON.stringify(
			{
				specversion: '1.0',
				id: crypto.randomUUID(),
				source: 'https://playground.behavioralstate.io',
				type: cloudEventType,
				datacontenttype: 'application/json',
				dataschema: found?.dataschema ?? '',
				time: new Date().toISOString(),
				data: {}
			},
			null,
			2
		);
	}

	function onCommandTypeChange() {
		buildCommandTemplate();
	}

	async function callEndpoint() {
		responseLoading = true;
		responseText = '';
		responseStatus = null;
		responseError = '';
		try {
			const opts = {
				method: activeMethod,
				headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders() }
			};
			if (activeMethod !== 'GET' && requestBody) opts.body = requestBody;
			const res = await fetch(`${activeEndpointBase}${resolvedPath}`, opts);
			responseStatus = res.status;
			const text = await res.text();
			try {
				responseText = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				responseText = text;
			}
		} catch (e) {
			responseError = e.message;
		} finally {
			responseLoading = false;
		}
	}

	function methodClass(method) {
		const map = {
			GET: 'method-get',
			POST: 'method-post',
			DELETE: 'method-delete',
			PUT: 'method-put',
			PATCH: 'method-patch'
		};
		return map[method] ?? 'method-other';
	}

	function statusClass(s) {
		if (!s) return '';
		if (s >= 200 && s < 300) return 'status-ok';
		if (s >= 400) return 'status-error';
		return 'status-warn';
	}

	function isActive(method, path, base) {
		return activeMethod === method && activePath === path && activeEndpointBase === base;
	}

	function statusLabel(s) {
		const labels = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' };
		return labels[s] ? `${s} ${labels[s]}` : String(s);
	}
</script>

<svelte:head>
	<title>Playground — BEST</title>
</svelte:head>

<div class="playground-shell">
	<!-- Header -->
	<div class="playground-header">
		<div class="playground-header-inner">
			<div>
				<p class="overline">Interactive</p>
				<h1 class="playground-title">Playground</h1>
				<p class="playground-subtitle">
					Point the playground at any BEST-compliant endpoint to explore its manifest, browse capabilities, and send commands — all from the browser.
				</p>
			</div>

			<!-- URL bar -->
			<form class="url-bar" onsubmit={(e) => { e.preventDefault(); discover(); }}>
				<input
					class="url-input"
					type="url"
					placeholder="https://your.compliant.BEST.endpoint"
					bind:value={baseUrl}
					spellcheck="false"
					autocomplete="off"
				/>
				<button class="btn-discover" type="submit" disabled={discovering}>
					{#if discovering}
						<span class="spinner"></span> Discovering…
					{:else}
						Discover
					{/if}
				</button>
			</form>

			{#if discoverError}
				<div class="error-banner">
					<strong>Could not reach endpoint.</strong> {discoverError}
					{#if discoverError.toLowerCase().includes('failed to fetch') || discoverError.toLowerCase().includes('networkerror')}
						<span class="cors-hint"> — the server may need <code>Access-Control-Allow-Origin: *</code> headers to be called from the browser.</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Main panel (only shown after manifest is loaded) -->
	{#if manifest}
		<!-- Sign-in strip — the device flow where the manifest declares it -->
		{#if canSignIn || signedIn}
			<div class="signin-strip">
				{#if signedIn}
					<span class="signin-label">
						Signed in{#if signedIn.name}&nbsp;as <strong>{signedIn.name}</strong>{/if}{#if signedIn.tenantId}&nbsp;· tenant <code>{signedIn.tenantId}</code>{/if}
					</span>
					<span class="signin-hint">The credential stays in this page’s memory and is never shown.</span>
					<button class="btn-quiet" onclick={signOut}>Sign out</button>
				{:else if signIn}
					<span class="signin-label">Open this link in your own browser, sign in and approve:</span>
					<a class="signin-link" href={signIn.link} target="_blank" rel="noopener">{signIn.link}</a>
					<button class="btn-quiet" onclick={() => navigator.clipboard?.writeText(signIn.link)}>Copy link</button>
					{#if signIn.userCode}<span class="signin-code">Code <code>{signIn.userCode}</code></span>{/if}
					<span class="signin-hint">Keep this page open: it collects the credential once you approve.</span>
					<span class="signin-hint"><span class="spinner small"></span> Waiting for approval…</span>
					<button class="btn-quiet" onclick={stopSignIn}>Cancel</button>
				{:else}
					<button class="btn-discover" onclick={startSignIn}>Sign in</button>
					<span class="signin-hint">by the device flow (RFC 8628): you approve in your own browser, and the playground is given its own credential.</span>
					{#if !manualCredential}
						<button class="btn-link" onclick={() => (manualCredential = true)}>Use a credential you already hold</button>
					{/if}
					{#if signInError}<span class="auth-warning">{signInError}</span>{/if}
				{/if}
			</div>
		{/if}

		<!-- Credential strip — pasting a credential, where there is no sign-in or the person asked for it -->
		{#if needsAuth && showCredentialInput}
			<div class="auth-strip">
				<span class="auth-label">
					{#if auth.type === 'apiKey'}API key{:else if auth.type === 'bearer' || auth.type === 'oauth2'}Bearer token{:else}Credential{/if}
					required
					{#if auth.scheme}<span class="auth-scheme">({auth.scheme})</span>{/if}
				</span>
				<input
					class="auth-input"
					type="password"
					placeholder="Paste your credential here…"
					bind:value={credential}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if auth.docs}
					<a class="auth-docs-link" href={auth.docs} target="_blank" rel="noopener">
						{auth.type === 'bearer' || auth.type === 'oauth2' ? 'How to get a token' : 'How to get a key'} ↗
					</a>
				{/if}
				{#if !credential}
					<span class="auth-warning">Requests will return 401 until a credential is provided.</span>
				{/if}
			</div>
		{/if}

		{#if showTenantInput}
			<div class="auth-strip">
				<span class="auth-label">Tenant ID required</span>
				<input
					class="auth-input"
					type="text"
					placeholder="Enter your tenant ID…"
					bind:value={tenantId}
					onkeydown={(e) => { if (e.key === 'Enter') loadTenantManifest(); }}
					autocomplete="off"
					spellcheck="false"
				/>
				<button class="btn-discover" onclick={loadTenantManifest} disabled={tenantDiscovering || !tenantId}>
					{#if tenantDiscovering}<span class="spinner"></span> Loading…{:else}Load Tenant{/if}
				</button>
				{#if tenantError}
					<span class="auth-warning">{tenantError}</span>
				{:else if !tenantId}
					<span class="auth-warning">Enter your tenant ID to access capabilities.</span>
				{/if}
			</div>
		{/if}

		<div class="playground-body">
			<!-- Left: capabilities tree -->
			<aside class="tree-panel">
				{#snippet capGroup(cap)}
					{@const capBase = resolveEndpointBase(cap)}
					<details class="cap-group" open>
						<summary class="cap-name" title={cap.description ?? ''}>
							{cap.name.replace('io.best.', '')}
							{#if cap.status && cap.status !== 'full'}<span class="cap-badge">{cap.status}</span>{/if}
						</summary>
						{#if cap.extends}
							<p class="cap-extends">extends {cap.extends.replace('io.best.', '')}</p>
						{/if}
						{#if cap.endpoints && cap.endpoints.length > 0}
							{#each cap.endpoints as ep}
								<button
									class="endpoint-row {isActive(ep.method, ep.path, capBase) ? 'active' : ''}"
									onclick={() => selectEndpoint(ep.method, ep.path, ep.description ?? cap.description, capBase)}
								>
									<span class="method-badge {methodClass(ep.method)}">{ep.method}</span>
									<span class="ep-path">{ep.path}</span>
								</button>
							{/each}
						{:else}
							<p class="no-endpoints">No endpoints declared</p>
						{/if}
					</details>
				{/snippet}

				{#if serviceEntries.length > 0}
					<div class="tree-section-label">Services ({serviceEntries.length})</div>
					{#each groupedServices as group}
						{@const access = serviceAccess(group.svc)}
						<div class="svc-group">
							<div class="svc-head">
								<span class="svc-name">{group.id}</span>
								<span class="svc-access access-{access.kind}">{access.label}</span>
							</div>
							{#if group.svc.description}
								<p class="svc-desc" title={group.svc.description}>{group.svc.description}</p>
							{/if}
							{#each group.caps as cap}
								{@render capGroup(cap)}
							{/each}
							{#if group.caps.length === 0}
								<p class="no-endpoints">
									{#if tenantTemplate && !onTenantManifest && access.kind === 'signin'}
										Its capabilities are in the account’s manifest, after sign-in.
									{:else}
										No capabilities in this manifest.
									{/if}
								</p>
							{/if}
						</div>
					{/each}
				{/if}

				{#if ungroupedCaps.length > 0}
					<div class="tree-section-label" style={serviceEntries.length > 0 ? 'margin-top: 1.5rem;' : ''}>
						{serviceEntries.length > 0 ? 'Other capabilities' : 'Capabilities'}
					</div>
					{#each ungroupedCaps as cap}
						{@render capGroup(cap)}
					{/each}
				{/if}

				{#if capabilities.length === 0 && serviceEntries.length === 0 && !tenantTemplate}
					<div class="no-capabilities">
						<p>No capabilities declared in this manifest.</p>
					</div>
				{/if}

				{#if agents.length > 0}
					<div class="tree-section-label" style="margin-top: 1.5rem;">Agents ({agents.length})</div>
					{#each agents as agent}
						<div class="service-row">
							<span class="status-dot {agent.status === 'running' ? 'dot-running' : agent.status === 'paused' ? 'dot-paused' : 'dot-stopped'}"></span>
							<span class="svc-name">{agent.name ?? agent.id}</span>
							<span class="svc-status">{agent.status}</span>
						</div>
					{/each}
				{/if}
			</aside>

			<!-- Right: request + response -->
			<section class="response-panel">
				{#if activeMethod}
					<div class="req-header">
						<span class="method-badge {methodClass(activeMethod)}">{activeMethod}</span>
						<span class="req-url">{activeEndpointBase}{resolvedPath}</span>
						{#if responseStatus}
							<span class="status-badge {statusClass(responseStatus)}">{statusLabel(responseStatus)}</span>
						{/if}
						{#if responseLoading}
							<span class="spinner small"></span>
						{/if}
					</div>

					<!-- Path parameter inputs -->
					{#if Object.keys(pathParams).length > 0}
						<div class="param-form">
							<div class="param-form-label">Path parameters</div>
							{#each Object.keys(pathParams) as paramName}
								<div class="param-row">
									<label class="param-name" for="param-{paramName}">{'{' + paramName + '}'}</label>
									<input
										id="param-{paramName}"
										class="param-input"
										type="text"
										placeholder={paramName}
										bind:value={pathParams[paramName]}
									/>
								</div>
							{/each}
							{#if activeMethod === 'GET'}
								<button
									class="btn-send"
									onclick={callEndpoint}
									disabled={responseLoading || hasUnresolvedParams}
								>
									{responseLoading ? 'Loading…' : `Send GET ${resolvedPath}`}
								</button>
							{/if}
						</div>
					{/if}

					<!-- POST /commands: command selector + body editor -->
					{#if isPostCommands && !hasUnresolvedParams}
						<div class="command-form">
							{#if commandCatalogue.length > 0}
								<div class="field-row">
									<label class="field-label" for="cmd-type">Command type</label>
									<select
										id="cmd-type"
										class="cmd-select"
										bind:value={selectedCommandType}
										onchange={onCommandTypeChange}
									>
										{#each commandCatalogue as cmd}
											<option value={cmd.schema}>{cmd.schema}</option>
										{/each}
									</select>
									{#if commandCatalogue.find(c => c.schema === selectedCommandType)?.description}
										<p class="field-hint">{commandCatalogue.find(c => c.schema === selectedCommandType).description}</p>
									{/if}
								</div>
							{/if}
							<div class="field-row">
								<label class="field-label" for="req-body">Request body (CloudEvent)</label>
								<textarea
									id="req-body"
									class="body-editor"
									rows="14"
									spellcheck="false"
									bind:value={requestBody}
								></textarea>
							</div>
							<button class="btn-send" onclick={callEndpoint} disabled={responseLoading}>
								{responseLoading ? 'Sending…' : 'Send POST /commands'}
							</button>
						</div>

					<!-- Other POST/DELETE/PUT: plain body editor -->
					{:else if activeMethod !== 'GET' && !hasUnresolvedParams}
						<div class="command-form">
							<div class="field-row">
								<label class="field-label" for="req-body-plain">Request body</label>
								<textarea
									id="req-body-plain"
									class="body-editor"
									rows="10"
									spellcheck="false"
									bind:value={requestBody}
								></textarea>
							</div>
							<button class="btn-send" onclick={callEndpoint} disabled={responseLoading}>
								{responseLoading ? 'Sending…' : `Send ${activeMethod} ${activePath}`}
							</button>
						</div>
					{/if}

					<!-- Response -->
					{#if responseError}
						<div class="error-banner" style="margin-top: 1rem;">
							{responseError}
							{#if responseError.toLowerCase().includes('failed to fetch')}
								<span class="cors-hint"> — check CORS headers on the server (<code>Access-Control-Allow-Origin: *</code>).</span>
							{/if}
						</div>
					{:else if responseText}
						<div class="response-block">
							<pre class="response-pre"><code>{responseText}</code></pre>
						</div>
					{/if}
				{:else}
					<div class="empty-state">
						<p>Select an endpoint from the capabilities tree to interact with it.</p>
					</div>
				{/if}
			</section>
		</div>
	{:else if !discovering && !discoverError}
		<div class="empty-landing">
			<p>Enter the base URL of a BEST-compliant endpoint and click <strong>Discover</strong>.</p>
			<p class="hint">The playground fetches <code>/.well-known/best</code> and builds the capabilities tree from the manifest. You can also paste a manifest URL directly — including a tenant manifest like <code>/.well-known/best/&#123;tenantId&#125;</code>.</p>
		</div>
	{/if}
</div>

<style>
	.playground-shell {
		min-height: calc(100vh - var(--nav-height));
		display: flex;
		flex-direction: column;
	}

	.playground-header {
		border-bottom: 1px solid var(--color-border);
		padding: 2.5rem 1.5rem 2rem;
	}

	.playground-header-inner {
		max-width: 72rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.overline {
		color: var(--color-accent);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin: 0 0 0.5rem;
	}

	.playground-title {
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
		color: var(--color-text);
	}

	.playground-subtitle {
		color: var(--color-text-muted);
		margin: 0;
		max-width: 44rem;
		font-size: 0.9375rem;
	}

	/* URL bar */
	.url-bar {
		display: flex;
		gap: 0.75rem;
		align-items: stretch;
	}

	.url-input {
		flex: 1;
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.625rem 1rem;
		color: var(--color-text);
		font-size: 0.9375rem;
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		outline: none;
		transition: border-color 0.15s;
	}

	.url-input:focus {
		border-color: var(--color-accent);
	}

	.btn-discover {
		background: var(--color-accent);
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.625rem 1.25rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: background 0.15s;
		white-space: nowrap;
	}

	.btn-discover:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-discover:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Errors */
	.error-banner {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #fca5a5;
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
	}

	.cors-hint {
		color: #fca5a5;
		opacity: 0.85;
	}

	.cors-hint code {
		font-family: monospace;
		background: rgba(255,255,255,0.08);
		padding: 0.1em 0.3em;
		border-radius: 0.25rem;
	}

	/* Two-panel body */
	.playground-body {
		flex: 1;
		display: grid;
		grid-template-columns: 280px 1fr;
		max-width: 72rem;
		margin: 0 auto;
		width: 100%;
		gap: 0;
	}

	/* Capabilities tree */
	.tree-panel {
		border-right: 1px solid var(--color-border);
		padding: 1.5rem 1rem;
		overflow-y: auto;
		overflow-x: hidden;
		font-size: 0.8125rem;
		min-width: 0;
	}

	.tree-section-label {
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
		padding: 0 0.25rem;
	}

	.cap-group {
		margin-bottom: 0.75rem;
	}

	.cap-name {
		color: var(--color-text);
		font-weight: 500;
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0.2rem 0.25rem;
		list-style: none;
		user-select: none;
	}

	.cap-name::-webkit-details-marker { display: none; }

	.cap-badge {
		font-size: 0.6rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #facc15;
		background: rgba(250, 204, 21, 0.12);
		padding: 0.1em 0.45em;
		border-radius: 0.25rem;
		margin-left: 0.4rem;
		vertical-align: middle;
	}

	.cap-extends {
		margin: 0 0 0.2rem;
		padding: 0 1rem;
		font-size: 0.6875rem;
		font-style: italic;
		color: var(--color-text-muted);
		opacity: 0.8;
	}

	.cap-name::before {
		content: '▶ ';
		font-size: 0.6rem;
		opacity: 0.5;
		transition: transform 0.15s;
	}

	details[open] > .cap-name::before {
		content: '▼ ';
	}

	.endpoint-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
		background: none;
		border: none;
		padding: 0.3rem 0.5rem 0.3rem 1rem;
		cursor: pointer;
		border-radius: 0.375rem;
		color: var(--color-text-muted);
		text-align: left;
		font-size: 0.8125rem;
		transition: background 0.1s, color 0.1s;
		box-sizing: border-box;
	}

	.endpoint-row:hover {
		background: rgba(255, 255, 255, 0.04);
		color: var(--color-text);
	}

	.endpoint-row.active {
		background: rgba(59, 130, 246, 0.12);
		color: var(--color-text);
	}

	.ep-path {
		font-family: 'Fira Code', monospace;
		font-size: 0.75rem;
		word-break: break-all;
		white-space: normal;
		min-width: 0;
		line-height: 1.4;
		padding-top: 0.1rem;
	}

	.no-endpoints {
		padding: 0.25rem 1rem;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		margin: 0;
	}

	.no-capabilities {
		margin: 0.75rem 0;
		padding: 0.75rem 1rem;
		background: rgba(251, 191, 36, 0.07);
		border: 1px solid rgba(251, 191, 36, 0.2);
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.no-capabilities p {
		margin: 0 0 0.4rem;
	}

	.no-capabilities p:last-child {
		margin: 0;
	}

	.no-capabilities code {
		font-family: 'Fira Code', monospace;
		font-size: 0.75rem;
		background: rgba(255, 255, 255, 0.07);
		padding: 0.1em 0.3em;
		border-radius: 0.25rem;
	}

	.no-capabilities a {
		color: var(--color-accent);
		text-decoration: none;
	}

	.no-capabilities a:hover {
		text-decoration: underline;
	}

	/* Method badges */
	.method-badge {
		font-family: 'Fira Code', monospace;
		font-size: 0.65rem;
		font-weight: 700;
		padding: 0.1em 0.4em;
		border-radius: 0.25rem;
		letter-spacing: 0.02em;
		flex-shrink: 0;
		line-height: 1.6;
	}

	.method-get    { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
	.method-post   { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
	.method-delete { color: #f87171; background: rgba(248, 113, 113, 0.1); }
	.method-put    { color: #facc15; background: rgba(250, 204, 21, 0.1); }
	.method-patch  { color: #fb923c; background: rgba(251, 146, 60, 0.1); }
	.method-other  { color: var(--color-text-muted); background: rgba(255,255,255,0.06); }

	/* Services, each with its capabilities */
	.svc-group {
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-border);
	}

	.svc-group:last-of-type {
		border-bottom: none;
	}

	.svc-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.2rem 0.25rem;
	}

	.svc-head .svc-name {
		font-family: 'Fira Code', monospace;
		font-size: 0.75rem;
		font-weight: 600;
		word-break: break-all;
		min-width: 0;
	}

	.svc-access {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.1em 0.45em;
		border-radius: 0.25rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.access-public { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
	.access-signin { color: #60a5fa; background: rgba(96, 165, 250, 0.1); }
	.access-other  { color: #c4b5fd; background: rgba(196, 181, 253, 0.1); }

	.svc-desc {
		margin: 0.15rem 0 0.4rem;
		padding: 0 0.25rem;
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--color-text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.service-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.25rem;
		font-size: 0.8125rem;
	}

	.status-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot-running { background: #4ade80; }
	.dot-paused  { background: #facc15; }
	.dot-stopped { background: #6b7280; }

	.svc-name { color: var(--color-text); flex: 1; }

	.svc-status {
		color: var(--color-text-muted);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Response panel */
	.response-panel {
		padding: 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.req-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.req-url {
		font-family: 'Fira Code', monospace;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		flex: 1;
		word-break: break-all;
	}

	.status-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.15em 0.5em;
		border-radius: 0.25rem;
	}
	.status-ok    { color: #4ade80; background: rgba(74, 222, 128, 0.1); }
	.status-error { color: #f87171; background: rgba(248, 113, 113, 0.1); }
	.status-warn  { color: #facc15; background: rgba(250, 204, 21, 0.1); }

	/* Command form */
	.command-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.field-row {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	.cmd-select {
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		color: var(--color-text);
		font-size: 0.875rem;
		outline: none;
		max-width: 24rem;
	}

	.body-editor {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.75rem 1rem;
		color: var(--color-text);
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.8125rem;
		line-height: 1.6;
		resize: vertical;
		outline: none;
		width: 100%;
	}

	.body-editor:focus {
		border-color: var(--color-accent);
	}

	.btn-send {
		align-self: flex-start;
		background: var(--color-accent);
		color: #fff;
		border: none;
		border-radius: 0.5rem;
		padding: 0.5rem 1.125rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-send:hover:not(:disabled) {
		background: var(--color-accent-hover);
	}

	.btn-send:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Response output */
	.response-block {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		overflow: auto;
	}

	.response-pre {
		padding: 1rem 1.25rem;
		margin: 0;
		font-family: 'Fira Code', 'Cascadia Code', monospace;
		font-size: 0.8125rem;
		line-height: 1.65;
		color: var(--color-text-muted);
		overflow-x: auto;
	}

	.response-pre code {
		color: inherit;
	}

	/* Empty states */
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 16rem;
		color: var(--color-text-muted);
		font-size: 0.9375rem;
		text-align: center;
	}

	.empty-landing {
		max-width: 72rem;
		margin: 4rem auto;
		padding: 0 1.5rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty-landing p { margin: 0 0 0.5rem; }

	.empty-landing strong { color: var(--color-text); }

	.empty-landing code {
		font-family: monospace;
		background: rgba(255,255,255,0.06);
		padding: 0.15em 0.4em;
		border-radius: 0.25rem;
	}

	.empty-landing .hint {
		font-size: 0.875rem;
		opacity: 0.7;
	}

	/* Spinner */
	.spinner {
		display: inline-block;
		width: 0.875rem;
		height: 0.875rem;
		border: 2px solid rgba(255,255,255,0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner.small {
		width: 0.75rem;
		height: 0.75rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Path parameter inputs */
	.param-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: rgba(96, 165, 250, 0.05);
		border: 1px solid rgba(96, 165, 250, 0.2);
		border-radius: 0.5rem;
	}

	.param-form-label {
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
		margin-bottom: 0.25rem;
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.param-name {
		font-family: 'Fira Code', monospace;
		font-size: 0.8125rem;
		color: #60a5fa;
		min-width: 10rem;
		flex-shrink: 0;
	}

	.param-input {
		flex: 1;
		max-width: 20rem;
		background: var(--color-bg-card);
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		padding: 0.35rem 0.65rem;
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: 'Fira Code', monospace;
		outline: none;
		transition: border-color 0.15s;
	}

	.param-input:focus {
		border-color: #60a5fa;
	}

	/* Sign-in strip */
	.signin-strip {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.75rem 1.5rem;
		background: rgba(96, 165, 250, 0.06);
		border-bottom: 1px solid rgba(96, 165, 250, 0.2);
		font-size: 0.8125rem;
	}

	.signin-label {
		color: var(--color-text);
		font-weight: 600;
	}

	.signin-label code,
	.signin-code code {
		font-family: 'Fira Code', monospace;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.07);
		padding: 0.1em 0.35em;
		border-radius: 0.25rem;
	}

	.signin-link {
		color: #60a5fa;
		font-family: 'Fira Code', monospace;
		font-size: 0.8125rem;
		word-break: break-all;
	}

	.signin-code {
		color: var(--color-text);
	}

	.signin-hint {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.btn-quiet,
	.btn-link {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
		border-radius: 0.375rem;
		padding: 0.3rem 0.75rem;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.btn-link {
		border: none;
		padding: 0;
		text-decoration: underline;
	}

	.btn-quiet:hover,
	.btn-link:hover {
		color: var(--color-text);
	}

	/* Auth strip */
	.auth-strip {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.75rem 1.5rem;
		background: rgba(251, 191, 36, 0.06);
		border-bottom: 1px solid rgba(251, 191, 36, 0.2);
		font-size: 0.8125rem;
	}

	.auth-label {
		color: #fbbf24;
		font-weight: 600;
		white-space: nowrap;
	}

	.auth-scheme {
		font-weight: 400;
		opacity: 0.75;
	}

	.auth-input {
		flex: 1;
		min-width: 16rem;
		max-width: 28rem;
		background: var(--color-bg-card);
		border: 1px solid rgba(251, 191, 36, 0.35);
		border-radius: 0.375rem;
		padding: 0.375rem 0.75rem;
		color: var(--color-text);
		font-size: 0.8125rem;
		font-family: 'Fira Code', monospace;
		outline: none;
		transition: border-color 0.15s;
	}

	.auth-input:focus {
		border-color: #fbbf24;
	}

	.auth-docs-link {
		color: #fbbf24;
		font-size: 0.75rem;
		text-decoration: none;
		white-space: nowrap;
		opacity: 0.8;
	}

	.auth-docs-link:hover { opacity: 1; }

	.auth-warning {
		color: #fbbf24;
		opacity: 0.65;
		font-size: 0.75rem;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.playground-body {
			grid-template-columns: 1fr;
		}

		.tree-panel {
			border-right: none;
			border-bottom: 1px solid var(--color-border);
		}
	}
</style>
