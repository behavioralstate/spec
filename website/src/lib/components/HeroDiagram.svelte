<div class="diagram-card">
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
</div>

<style>
	.diagram-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		padding: 1.25rem 1.5rem;
		max-width: 680px;
		margin: 0 auto 2rem;
	}

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
		.diagram-card {
			padding: 1rem 1rem;
		}
		.diagram { flex-direction: column; }
		.da { transform: rotate(90deg); }
		.dn-box { white-space: normal; }
	}
</style>
