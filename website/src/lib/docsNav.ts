// The one list of docs pages, shown by the sidebar and by the /specs index.
export const docsNav = [
	{
		label: 'Getting Started',
		items: [
			{ label: 'Overview', href: '/specs/overview', summary: 'What BEST is and how it works' },
			{ label: 'Discovery', href: '/specs/discovery', summary: 'The /.well-known/best manifest' },
			{ label: 'Quick start with AI', href: '/specs/quickstart', summary: 'Copy-paste prompts to get started fast' }
		]
	},
	{
		label: 'Services',
		items: [
			{ label: 'Commands', href: '/specs/agents/commands', summary: 'Accept and catalogue commands' },
			{ label: 'Events', href: '/specs/agents/events', summary: 'Events published by services' },
			{ label: 'Queries', href: '/specs/agents/queries', summary: 'Synchronous reads of current state' },
			{ label: 'Workflows', href: '/specs/agents/workflows', summary: 'Published multi-step recipes, caller-driven' }
		]
	},
	{
		label: 'Transports',
		items: [
			{ label: 'HTTP', href: '/specs/transports/http', summary: 'HTTP/JSON API reference' },
			{ label: 'MCP', href: '/specs/transports/mcp', summary: 'Model Context Protocol binding' }
		]
	},
	{
		label: 'Reference',
		items: [
			{ label: 'Versioning', href: '/specs/versioning', summary: 'How versions work' },
			{ label: 'Conformance', href: '/specs/conformance', summary: 'What it means to be BEST-compliant' },
			{ label: 'Security', href: '/specs/security', summary: 'What every implementation must observe' },
			{ label: 'Design Decisions', href: '/specs/design-decisions', summary: 'Why BEST is shaped the way it is' }
		]
	},
	{
		label: 'Guides',
		items: [
			{ label: 'Composing Processes', href: '/specs/composing-processes', summary: 'Combining commands into multi-step processes' },
			{ label: 'Identity and Registration', href: '/specs/identity-and-registration', summary: 'How a person signs an agent in to a service' }
		]
	},
	{
		label: 'Comparisons',
		items: [
			{ label: 'BEST vs REST', href: '/specs/comparisons/rest', summary: 'Operations against resources' },
			{ label: 'BEST vs UCP', href: '/specs/comparisons/ucp', summary: "How BEST relates to Google's Universal Commerce Protocol" }
		]
	}
];
