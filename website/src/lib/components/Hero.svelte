<script>
	import Logo from '$lib/components/Logo.svelte';

	const gitTag = import.meta.env.VITE_GIT_TAG;
	const isCleanTag = gitTag ? /^v\d+\.\d+\.\d+$/.test(gitTag) : false;
	const shaMatch = gitTag ? gitTag.match(/-g([0-9a-f]+)$/) : null;
	const tagUrl = isCleanTag
		? `https://github.com/openagentprotocol/spec/releases/tag/${gitTag}`
		: shaMatch
			? `https://github.com/openagentprotocol/spec/commit/${shaMatch[1]}`
			: null;
</script>

<section class="hero">
	<div class="glow-left" aria-hidden="true"></div>
	<div class="glow-right" aria-hidden="true"></div>

	<div class="hero-inner">
		<div class="hero-brand">
			<Logo size={40} />
			<span class="hero-brand-text">Open Agent Protocol</span>
		</div>
		<h1 class="hero-title">
			Agent Interoperability.<br /><span class="hero-title-muted">By Design.</span>
		</h1>
		<p class="hero-subtitle">
			The open standard for service interoperability — any service that accepts commands and publishes events, discoverable by any caller, on any transport.
		</p>
		<div class="hero-actions">
			<a href="/docs" class="btn-primary">Read the docs</a>
			<a href="https://github.com/openagentprotocol/spec" target="_blank" rel="noopener" class="btn-secondary">View on GitHub</a>
		</div>
		{#if gitTag}
		<p class="hero-build">
			{#if tagUrl}<a href={tagUrl} target="_blank" rel="noopener">{gitTag}</a>{:else}{gitTag}{/if}
		</p>
		{/if}
	</div>
</section>

<style>
	.hero {
		position: relative;
		background: #0a0e1a;
		padding: 8rem 1.5rem;
		text-align: center;
		overflow: hidden;
	}

	.glow-left {
		position: absolute;
		top: -80px;
		left: -120px;
		width: 600px;
		height: 600px;
		background: radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%);
		pointer-events: none;
	}

	.glow-right {
		position: absolute;
		bottom: -80px;
		right: -120px;
		width: 500px;
		height: 500px;
		background: radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%);
		pointer-events: none;
	}

	.hero-inner {
		position: relative;
		z-index: 1;
		max-width: 56rem;
		margin: 0 auto;
	}

	.hero-brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}

	.hero-brand-text {
		color: #ffffff;
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.hero-title {
		color: #ffffff;
		font-size: clamp(2.5rem, 6vw, 3.75rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.02em;
		margin-bottom: 1.5rem;
	}

	.hero-title-muted {
		color: #94a3b8;
	}

	.hero-subtitle {
		color: #94a3b8;
		font-size: 1.125rem;
		line-height: 1.7;
		max-width: 42rem;
		margin: 0 auto 2.5rem;
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
		margin-bottom: 3.5rem;
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

	.btn-primary:hover {
		background: #60a5fa;
	}

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

	.hero-build {
		margin-top: 2rem;
		font-size: 0.75rem;
		color: rgba(148, 163, 184, 0.5);
		letter-spacing: 0.02em;
	}

	.hero-build a {
		color: rgba(148, 163, 184, 0.5);
		text-decoration: none;
		font-family: monospace;
	}

	.hero-build a:hover {
		color: #94a3b8;
	}

	@media (max-width: 480px) {
		.hero { padding: 5rem 1.5rem; }
	}
</style>
