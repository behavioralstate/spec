<script>
	import DocsSidebar from '$lib/components/DocsSidebar.svelte';
	let { children } = $props();
</script>

<div class="docs-shell">
	<DocsSidebar />
	<div class="docs-body">
		{@render children()}
	</div>
</div>

<style>
	.docs-shell {
		display: flex;
		min-height: calc(100vh - var(--nav-height));
	}

	.docs-body {
		flex: 1;
		min-width: 0;
	}
</style>
