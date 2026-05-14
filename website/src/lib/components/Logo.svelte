<script lang="ts">
	let {
		size = 36,
		class: className = ''
	}: { size?: number; class?: string } = $props();

	// Width maintains 3:2 ratio; the SVG viewBox is fixed at 48×32
	const width = $derived(Math.round(size * 1.5));
</script>

<svg
	width={width}
	height={size}
	viewBox="0 0 48 32"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-label="BSP"
	role="img"
	class={className}
>
	<!-- Rounded rectangle background -->
	<rect width="48" height="32" rx="7" fill="#3b82f6" />

	<!-- Subtle inner highlight for depth -->
	<rect x="0.5" y="0.5" width="47" height="31" rx="6.5"
		fill="none"
		stroke="rgba(255,255,255,0.15)"
		stroke-width="1"
	/>

	<!-- BSP text — tight tracking, bold, white -->
	<text
		x="24"
		y="22.5"
		text-anchor="middle"
		fill="white"
		font-family="'Inter', system-ui, -apple-system, sans-serif"
		font-weight="800"
		font-size="15"
		letter-spacing="-0.5"
	>BSP</text>
</svg>
