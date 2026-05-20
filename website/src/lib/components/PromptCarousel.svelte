<script lang="ts">
	import { onDestroy } from 'svelte';

	const slides: Array<{ type: 'diagram' } | { type: 'prompt'; label: string; text: string }> = [
		{ type: 'diagram' },
		{
			type: 'prompt',
			label: 'Make your service BSP-compliant',
			text: `Make my [Express / ASP.NET Core / FastAPI] service at [https://api.example.com] BSP-compliant. Spec: https://behavioralstate.io/docs`
		},
		{
			type: 'prompt',
			label: 'Configure bsp-mcp for your LLM client',
			text: `Configure bsp-mcp for [VS Code Copilot / Claude Desktop] with base URL [https://api.example.com/bsp] and API key [my-key]. Docs: https://behavioralstate.io/docs/transports/mcp`
		},
		{
			type: 'prompt',
			label: 'Validate your BSP endpoint',
			text: `Validate that [https://api.example.com] correctly implements the BSP spec. Spec: https://behavioralstate.io/docs`
		}
	];

	let current = $state(0);
	let copied = $state(false);
	let paused = $state(false);
	let userSelected = $state(false);
	let transitioning = $state(false);

	function advance() {
		if (paused || userSelected) return;
		transitioning = true;
		setTimeout(() => {
			current = (current + 1) % slides.length;
			transitioning = false;
		}, 150);
	}

	const timer = setInterval(advance, 3000);
	onDestroy(() => clearInterval(timer));

	function goTo(i: number) {
		if (i === current) return;
		userSelected = true;
		transitioning = true;
		setTimeout(() => {
			current = i;
			transitioning = false;
		}, 150);
	}

	function copy() {
		const slide = slides[current];
		if (slide.type !== 'prompt') return;
		navigator.clipboard?.writeText(slide.text);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<div
	class="carousel"
	onmouseenter={() => (paused = true)}
	onmouseleave={() => (paused = false)}
	role="region"
	aria-label="Prompt carousel"
>
	<div class="slides">
		{#each slides as slide, i}
			<div class="slide" class:slide--active={i === current} class:fade={i === current && transitioning}>
				{#if slide.type === 'diagram'}
					<div class="diagram">
						<div class="dn">
							<div class="dn-lbl">Caller</div>
							<div class="dn-box">Any Caller</div>
							<div class="dn-sub">app · agent · IoT · human</div>
						</div>
						<div class="da">
							<span class="da-lbl">Command</span>
							<span class="da-sym">→</span>
						</div>
						<div class="dn">
							<div class="dn-lbl">BSP Endpoint</div>
							<div class="dn-box dn-box--brand">Your Implementation</div>
							<div class="dn-sub">/.well-known/bsp</div>
						</div>
						<div class="da">
							<span class="da-lbl">Event</span>
							<span class="da-sym">→</span>
						</div>
						<div class="dn">
							<div class="dn-lbl">Consumer</div>
							<div class="dn-box">Any Agent</div>
							<div class="dn-sub">LLM · app · UI · agent</div>
						</div>
					</div>
				{:else}
					<div class="carousel-header">
						<span class="carousel-eyebrow">Try this prompt →</span>
						<span class="carousel-label">{slide.label}</span>
					</div>
					<pre class="carousel-text">{slide.text}</pre>
				{/if}
			</div>
		{/each}
	</div>

	<div class="carousel-footer">
		<div class="carousel-dots" role="tablist" aria-label="Select slide">
			{#each slides as slide, i}
				<button
					class="dot"
					class:dot--active={i === current}
					onclick={() => goTo(i)}
					role="tab"
					aria-selected={i === current}
					aria-label={slide.type === 'diagram' ? 'How BSP works' : `Prompt: ${slide.label}`}
				></button>
			{/each}
		</div>
		<button
			class="copy-btn"
			class:copy-btn--hidden={slides[current].type !== 'prompt'}
			onclick={copy}
		>
			{copied ? '✓ Copied' : 'Copy prompt'}
		</button>
	</div>
</div>

<style>
	.carousel {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		padding: 1.25rem 1.5rem;
		max-width: 680px;
		margin: 0 auto 2rem;
		text-align: left;
		cursor: default;
	}

	/* Stack all slides in the same grid cell so the tallest one sets the height */
	.slides {
		display: grid;
	}

	.slide {
		grid-area: 1 / 1;
		visibility: hidden;
		pointer-events: none;
	}

	.slide--active {
		visibility: visible;
		pointer-events: auto;
	}

	.slide.fade {
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.slide--active:not(.fade) {
		opacity: 1;
		transition: opacity 0.15s ease;
	}

	.carousel-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.875rem;
		flex-wrap: wrap;
	}

	.carousel-eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #3b82f6;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.carousel-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: #e2e8f0;
	}

	.carousel-text {
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
		font-size: 0.8125rem;
		line-height: 1.6;
		color: #94a3b8;
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
	}

	.carousel-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 1rem;
		gap: 1rem;
	}

	.carousel-dots {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		border: none;
		background: rgba(255, 255, 255, 0.18);
		cursor: pointer;
		padding: 0;
		transition: background 0.2s, transform 0.2s;
		flex-shrink: 0;
	}

	.dot:hover {
		background: rgba(255, 255, 255, 0.35);
		transform: scale(1.3);
	}

	.dot--active {
		background: #3b82f6;
		transform: scale(1.2);
	}

	.copy-btn {
		font-size: 0.75rem;
		font-weight: 600;
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.25);
		border-radius: 6px;
		padding: 0.3rem 0.875rem;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			border-color 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.copy-btn--hidden {
		visibility: hidden;
		pointer-events: none;
	}

	.copy-btn:hover {
		background: rgba(59, 130, 246, 0.2);
		color: #60a5fa;
		border-color: rgba(59, 130, 246, 0.4);
	}

	/* ── Diagram slide ────────────────────────────── */
	.diagram {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 1.25rem 0.5rem;
	}

	.dn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		min-width: 120px;
	}

	.dn-lbl {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: rgba(148, 163, 184, 0.5);
	}

	.dn-box {
		padding: 0.55rem 1.1rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #e2e8f0;
		background: rgba(255, 255, 255, 0.05);
		text-align: center;
		white-space: nowrap;
	}

	.dn-box--brand {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
		box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
	}

	.dn-sub {
		font-size: 0.625rem;
		color: rgba(148, 163, 184, 0.4);
		text-align: center;
	}

	.da {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0 0.25rem;
	}

	.da-lbl {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #3b82f6;
	}

	.da-sym {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.15);
		line-height: 1;
	}

	@media (max-width: 540px) {
		.carousel {
			padding: 1rem 1rem;
		}
		.diagram { flex-direction: column; }
		.da { transform: rotate(90deg); }
		.dn-box { white-space: normal; }
		.carousel-text { font-size: 0.75rem; }
	}
</style>
