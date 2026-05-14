<script>
	let { icon = '', title, description, logoSvg = '' } = $props();
</script>

<div class="card">
	<div class="card-icon">
		{#if logoSvg}
			{@html logoSvg}
		{:else}
			{icon}
		{/if}
	</div>
	<h3 class="card-title">{title}</h3>
	<p class="card-desc">{description}</p>
</div>

<style>
	.card {
		padding: 1.5rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: #111827;
		transition: border-color 0.2s, box-shadow 0.2s;
	}

	.card:hover {
		border-color: rgba(59, 130, 246, 0.3);
		box-shadow: 0 0 60px rgba(59, 130, 246, 0.15);
	}

	.card-icon {
		font-size: 1.5rem;
		margin-bottom: 1rem;
		height: 2rem;
		display: flex;
		align-items: center;
	}

	.card-icon :global(svg) {
		height: 2rem;
		width: auto;
	}

	.card-title {
		color: #ffffff;
		font-size: 1.0625rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.card-desc {
		color: #94a3b8;
		font-size: 0.875rem;
		line-height: 1.6;
		margin: 0;
	}
</style>
