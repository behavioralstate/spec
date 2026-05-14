<script>
	let { code } = $props();
</script>

<div class="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
	<div class="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
		<div class="w-3 h-3 rounded-full bg-red-500/60"></div>
		<div class="w-3 h-3 rounded-full bg-yellow-500/60"></div>
		<div class="w-3 h-3 rounded-full bg-green-500/60"></div>
		<span class="ml-2 text-xs text-[var(--color-text-muted)]">/.well-known/bsp</span>
	</div>
	<pre class="p-6 overflow-x-auto text-sm leading-relaxed"><code class="text-[var(--color-text-muted)]">{code}</code></pre>
</div>
