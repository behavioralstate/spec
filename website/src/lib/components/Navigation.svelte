<script>
	import Logo from '$lib/components/Logo.svelte';

	const navItems = [
		{ label: 'Features', href: '/#features' },
		{ label: 'Docs', href: '/docs' },
		{ label: 'Playground', href: '/playground' }
	];
</script>

<nav class="nav-shell">
	<div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
		<a href="/" class="flex items-center gap-2.5 no-underline">
			<Logo size={32} />
			<span class="nav-wordmark">Behavioural State Protocol</span>
		</a>
		<div class="flex items-center gap-8">
			{#each navItems as item}
				<a href={item.href} class="nav-link">{item.label}</a>
			{/each}
			<a
				href="https://github.com/behaviouralstate/spec"
				target="_blank"
				rel="noopener"
				class="nav-link"
			>GitHub</a>
		</div>
	</div>
</nav>

<style>
	.nav-shell {
		position: sticky;
		top: 0;
		z-index: 50;
		background: linear-gradient(180deg, rgba(13, 17, 32, 0.98) 0%, rgba(13, 17, 32, 0.95) 100%);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.nav-wordmark {
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: #ffffff;
	}

	.nav-link {
		font-size: 0.875rem;
		color: #94a3b8;
		text-decoration: none;
		transition: color 0.15s;
	}

	.nav-link:hover {
		color: #ffffff;
	}

	@media (max-width: 480px) {
		.nav-wordmark {
			display: none;
		}
	}
</style>
