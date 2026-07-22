# BEST — Behavioral State Protocol

CQRS separates write (commands) and read (events) — but there is no common way to discover what commands a service accepts, what events it produces, or how to interact with it, without reading bespoke documentation or source code.

BEST is a specification for service interoperability: how domain services expose their command ingestion surface and published events, and how callers — AI agents, Process Managers, UIs, other services — discover and interact with them, across any runtime, platform, language, or transport. BEST doesn't care how a service works internally; it only defines the interaction surface: what commands go in, what events come out, and how to discover the service.

## Documentation

**[SPEC.md](SPEC.md)** is the consolidated specification — the whole protocol in one document: design, discovery, commands, events, queries, transports, conformance, and security. Start there.

The same content is browsable per-topic at [behavioralstate.io](https://behavioralstate.io/), rendered from the pages under [`specs/`](specs/).

Upgrading an implementation from 0.8.x? See [MIGRATION.md](MIGRATION.md) — 0.9.0 renamed the protocol short name (BSP → BEST) and made the envelope a conformant CloudEvents 1.0 profile.

> The most recent stable release is [v0.9.0](https://github.com/behavioralstate/spec/releases/tag/spec/v0.9.0). To read the spec exactly as released, browse the repo at tag [v0.9.0](https://github.com/behavioralstate/spec/blob/spec/v0.9.0/README.md); the `main` branch is the work in progress.

## Protocol Artifacts

The machine-readable protocol definitions live under [`protocol/v1/`](protocol/v1/) and are the source of truth:

| Path | Contents |
|---|---|
| [`protocol/v1/schemas/`](protocol/v1/schemas/) | JSON Schema files for all capabilities |
| [`protocol/v1/services/`](protocol/v1/services/) | OpenAPI specs for the HTTP transport |
| [`protocol/v1/examples/`](protocol/v1/examples/) | Example manifests and payloads |

## Quick Start

```bash
# Validate protocol schemas
node scripts/validate-schemas.mjs

# Validate example payloads
node scripts/validate-examples.mjs

# Run the website locally
cd website && npm install && npm run dev
```

## best-mcp — MCP Server

`best-mcp` is the reference MCP server for BEST. Point it at any BEST-compliant endpoint and any MCP-capable LLM client (Claude Desktop, VS Code Copilot, Cursor, ChatGPT Desktop) can discover and interact with it immediately.

```bash
npx @behavioralstate/best-mcp
```

**stdio config** (VS Code Copilot, Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["@behavioralstate/best-mcp"],
      "env": {
        "BEST_MYAPP_BASE_URL": "https://api.example.com/best",
        "BEST_MYAPP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Per-app `BEST_<APP>_*` variables are the recommended configuration mode (default auth: `X-Api-Key` header). Multi-tenant endpoints, multiple connections, bearer/query-param auth, HTTP transport for ChatGPT Desktop, and per-request credential overrides are all covered in the [mcp-server README](mcp-server/README.md). Production deployments should pin an exact version (e.g. `@behavioralstate/best-mcp@1.7.0`).

## Cutting a Release

This repo has **two independent** versioned artifacts. Running one release does not release the other. Always use the scripts — never tag manually.

| Artifact | Tag prefix | Command | Outcome |
|---|---|---|---|
| `@behavioralstate/best-mcp` npm package | `mcp/v*` | `./scripts/release-mcp.sh [x.y.z]` | CI publishes to npm |
| BEST protocol spec + website | `spec/v*` | `./scripts/release.sh x.y.z [--prerelease]` | CI builds the site image → GHCR → IaC deploy PR |

`release-mcp.sh` with no argument auto-bumps the patch version. `release.sh` requires a clean `main` checkout, bumps `version.json` (the single source of truth for `{{BEST_VERSION}}` placeholders), updates this README's release references, tags, and creates the GitHub Release. When releasing both in one session, release `best-mcp` first.

## Community

- [Website & Documentation](https://behavioralstate.io/)
- [GitHub Issues](https://github.com/behavioralstate/spec/issues) — bug reports & feature requests
- [Contributing](https://github.com/behavioralstate/spec/blob/main/CONTRIBUTING.md) — how to contribute

## License

[Apache-2.0](LICENSE)
