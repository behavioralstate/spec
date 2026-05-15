# BSP — Behavioral State Protocol

CQRS separates write (commands) and read (events) — but there is no common way to discover what commands a service accepts, what events it produces, or how to interact with it, without reading bespoke documentation or source code.

BSP is a specification for service interoperability — how domain services expose their command ingestion surface and published events, how callers (AI agents, Process Managers, UIs, other services) discover and interact with them — across any runtime, platform, language, or transport.

BSP doesn't care how a service works internally. It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

If you are new to BSP, start with the [Overview](specs/overview.md) for the protocol's goals and design, then explore [Discovery](specs/discovery.md) and the [Agent capabilities](specs/agents/commands.md).

## BSP Documents

|  | Pre-release | WIP |
|---|:---:|:---:|
| **Core Specification:** | | |
| [BSP Overview](specs/overview.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/overview.md) | [WIP](specs/overview.md) |
| [Discovery](specs/discovery.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/discovery.md) | [WIP](specs/discovery.md) |
| [Versioning](specs/versioning.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/versioning.md) | [WIP](specs/versioning.md) |
| [Conformance](specs/conformance.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/conformance.md) | [WIP](specs/conformance.md) |
| | | |
| **Agent Capabilities:** | | |
| ~~[Registry](specs/agents/registry.md)~~ | *(removed — see [future concept](specs/agents/registry.md))* | — |
| [Lifecycle](specs/agents/lifecycle.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/agents/lifecycle.md) | [WIP](specs/agents/lifecycle.md) |
| [Events](specs/agents/events.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/agents/events.md) | [WIP](specs/agents/events.md) |
| [Commands](specs/agents/commands.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/agents/commands.md) | [WIP](specs/agents/commands.md) |
| [Queries](specs/agents/queries.md) | — | [WIP](specs/agents/queries.md) |
| [Memory](specs/agents/memory.md) | *(removed — see [design decisions](specs/design-decisions.md#service-metadata-vs-memory))* | — |
| | | |
| **Observability:** | | |
| ~~Tracing~~ | *(removed — see changelog)* | — |
| | | |
| **Transport Bindings:** | | |
| [HTTP](specs/transports/http.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/transports/http.md) | [WIP](specs/transports/http.md) |
| [MCP](specs/transports/mcp.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/transports/mcp.md) | [WIP](specs/transports/mcp.md) |
| [A2A](specs/transports/a2a.md) | [v0.5.11](https://github.com/behavioralstate/spec/blob/v0.5.11/specs/transports/a2a.md) | [WIP](specs/transports/a2a.md) |

> The most recent stable release is [v0.5.11](https://github.com/behavioralstate/spec/releases/tag/v0.5.11).

## Protocol Artifacts

The machine-readable protocol definitions live under [`protocol/v1/`](protocol/v1/) and are the source of truth:

| Path | Contents |
|---|---|
| [`protocol/v1/schemas/`](protocol/v1/schemas/) | JSON Schema files for all capabilities |
| [`protocol/v1/services/`](protocol/v1/services/) | OpenAPI specs for HTTP transport |
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

## bsp-mcp — MCP Server

`bsp-mcp` is the reference MCP server for BSP. Point it at any BSP-compliant endpoint and any LLM client can discover and interact with it immediately.

```bash
# Install globally
npm install -g @behavioralstate/bsp-mcp

# Or run without installing
npx @behavioralstate/bsp-mcp
```

**Required environment variables:**

```bash
BSP_ENDPOINT=https://api.example.com/BSP   # base URL of the BSP HTTP surface
BSP_API_KEY=<your-api-key>                 # sent as Authorization: Bearer <key>
```

**stdio config** (VS Code Copilot, Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["@behavioralstate/bsp-mcp"],
      "env": {
        "BSP_ENDPOINT": "https://api.example.com/BSP",
        "BSP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

**HTTP mode** (ChatGPT Desktop — requires HTTPS, use ngrok or Cloudflare Tunnel locally):

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 BSP_ENDPOINT=https://api.example.com/BSP BSP_API_KEY=<key> npx @behavioralstate/bsp-mcp
```

See [`mcp-server/README.md`](mcp-server/README.md) and [`specs/transports/mcp.md`](specs/transports/mcp.md) for full documentation.

## Cutting a Release

This repo has two independent versioned artifacts with separate tag prefixes:

| Artifact | Tag prefix | Triggers |
|---|---|---|
| BSP protocol spec + website | `spec/v*` | Docker build → GHCR → IaC PR |
| `@behavioralstate/bsp-mcp` npm package | `mcp/v*` | npm publish |

### Releasing the MCP server

1. Bump `version` in `mcp-server/package.json`
2. Commit and push
3. Tag and push:

```bash
git tag -a mcp/v1.5.5 -m "Release mcp v1.5.5"
git push origin mcp/v1.5.5
```

CI publishes `@behavioralstate/bsp-mcp` to npm automatically.

### Releasing the protocol spec / website

Use the release script to tag and publish a new version:

```bash
# Pre-release
./scripts/release.sh 0.2.0 --prerelease

# Stable release
./scripts/release.sh 1.0.0

# Override the protocol version date stamped into JSON/Svelte files
./scripts/release.sh 1.0.0 --protocol-version 2026-04-21
```

**Prerequisites:** must be run from the repo root, on `main`, with no uncommitted changes and with `origin/main` up to date.

The script will:
1. Stamp the protocol version date into all `"version": "YYYY-MM-DD"` fields in JSON and Svelte source files (defaults to today's date).
2. Update the documents table in this README to reference the new tag.
3. Prompt you to confirm before committing the version stamp and before creating the tag.
4. Create an annotated git tag (`spec/v<version>`) and push it to `origin`.

## Community

- [Website & Documentation](https://behavioralstate.io/)
- [GitHub Issues](https://github.com/behavioralstate/spec/issues) — bug reports & feature requests
- [Contributing](https://github.com/behavioralstate/spec/blob/main/CONTRIBUTING.md) — how to contribute

## License

[Apache-2.0](LICENSE)
