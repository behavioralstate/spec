# BSP — Behavioral State Protocol

CQRS separates write (commands) and read (events) — but there is no common way to discover what commands a service accepts, what events it produces, or how to interact with it, without reading bespoke documentation or source code.

BSP is a specification for service interoperability — how domain services expose their command ingestion surface and published events, how callers (AI agents, Process Managers, UIs, other services) discover and interact with them — across any runtime, platform, language, or transport.

BSP doesn't care how a service works internally. It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

If you are new to BSP, start with the [Overview](specs/overview.md) for the protocol's goals and design, then explore [Discovery](specs/discovery.md) and the [Agent capabilities](specs/agents/commands.md).

## BSP Documents

|  | Pre-release | WIP |
|---|:---:|:---:|
| **Core Specification:** | | |
| [BSP Overview](specs/overview.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/overview.md) | [WIP](specs/overview.md) |
| [Discovery](specs/discovery.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/discovery.md) | [WIP](specs/discovery.md) |
| [Versioning](specs/versioning.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/versioning.md) | [WIP](specs/versioning.md) |
| [Conformance](specs/conformance.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/conformance.md) | [WIP](specs/conformance.md) |
| | | |
| **Agent Capabilities:** | | |
| ~~[Registry](specs/agents/registry.md)~~ | *(removed — absorbed into core; see [design decisions](specs/design-decisions.md#registry-and-lifecycle-removed))* | — |
| ~~[Lifecycle](specs/agents/lifecycle.md)~~ | *(removed — absorbed into core; see [design decisions](specs/design-decisions.md#registry-and-lifecycle-removed))* | — |
| [Events](specs/agents/events.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/agents/events.md) | [WIP](specs/agents/events.md) |
| [Commands](specs/agents/commands.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/agents/commands.md) | [WIP](specs/agents/commands.md) |
| [Queries](specs/agents/queries.md) | — | [WIP](specs/agents/queries.md) |
| [Memory](specs/agents/memory.md) | *(removed — see [design decisions](specs/design-decisions.md#service-metadata-vs-memory))* | — |
| | | |
| **Observability:** | | |
| ~~Tracing~~ | *(removed — see changelog)* | — |
| | | |
| **Transport Bindings:** | | |
| [HTTP](specs/transports/http.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/transports/http.md) | [WIP](specs/transports/http.md) |
| [MCP](specs/transports/mcp.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/transports/mcp.md) | [WIP](specs/transports/mcp.md) |
| [A2A](specs/transports/a2a.md) | [v0.6.7](https://github.com/behavioralstate/spec/blob/spec/v0.6.7/specs/transports/a2a.md) | [WIP](specs/transports/a2a.md) |

> The most recent stable release is [v0.6.7](https://github.com/behavioralstate/spec/releases/tag/spec/v0.6.7).

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
BSP_API_KEY=<your-api-key>                 # credential value (default auth: Authorization: Bearer)
# BSP_AUTH_TYPE=apikey                     # set to 'apikey' for custom-header endpoints
# BSP_AUTH_HEADER=X-Api-Key               # header name when BSP_AUTH_TYPE=apikey
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

For services using a custom API key header, add `BSP_AUTH_TYPE=apikey` (and optionally `BSP_AUTH_HEADER` if the header name is not `X-Api-Key`).

**HTTP mode** (ChatGPT Desktop — requires HTTPS, use ngrok or Cloudflare Tunnel locally):

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 BSP_ENDPOINT=https://api.example.com/BSP BSP_API_KEY=<key> npx @behavioralstate/bsp-mcp
```

See [`mcp-server/README.md`](mcp-server/README.md) and [`specs/transports/mcp.md`](specs/transports/mcp.md) for full documentation.

## Cutting a Release

This repo has **two completely independent** versioned artifacts. Each has its own tag prefix, its own CI job, and its own release process. **Running one does not release the other.**

| Artifact | Tag prefix | CI job triggered | Outcome |
|---|---|---|---|
| `@behavioralstate/bsp-mcp` npm package | `mcp/v*` | `npm-publish` | Published to npm |
| BSP protocol spec + website | `spec/v*` | `docker-publish` → `update-iac` | Docker image → GHCR → IaC PR to deploy |

---

### Releasing `bsp-mcp` (npm package)

> **Use the script.** Never tag `mcp/v*` manually.

```bash
# Patch bump (most common — auto-detects latest tag and bumps patch)
./scripts/release-mcp.sh

# Minor or major bump — specify explicitly
./scripts/release-mcp.sh 1.6.0
./scripts/release-mcp.sh 2.0.0
```

To check the latest tag without running the script:
```bash
git tag --list 'mcp/v*' --sort=-version:refname | head -1
```

The script handles everything: detects the latest tag, bumps the version in `mcp-server/package.json`, commits and pushes to `main`, then creates and pushes the `mcp/v*` tag. CI publishes to npm automatically.

---

### Releasing the BSP spec + website

> **Use the script.** Never tag `spec/v*` manually.

```bash
# Stable release
./scripts/release.sh 0.5.12

# Pre-release
./scripts/release.sh 0.5.12 --prerelease
```

**Prerequisites:** run from the repo root, on `main`, with no uncommitted changes, and with `origin/main` up to date.

The script handles everything:
1. Bumps `version.json` (single source of truth for `{{BSP_VERSION}}` placeholders — no other files need editing)
2. Updates the documents table in this README to reference the new tag
3. Prompts for confirmation, then commits and pushes both changes
4. Creates and pushes an annotated `spec/v*` tag
5. Creates a GitHub Release
6. Moves the `BSP@stable` pointer to the new tag (stable releases only)

CI then builds the website Docker image, pushes to GHCR, and opens a PR in the IaC repo to deploy it.

---

### Releasing both in the same session

They are independent — order does not matter. Convention: release `bsp-mcp` first so the npm package is live before the spec website references the updated docs, then run the spec release script.

## Community

- [Website & Documentation](https://behavioralstate.io/)
- [GitHub Issues](https://github.com/behavioralstate/spec/issues) — bug reports & feature requests
- [Contributing](https://github.com/behavioralstate/spec/blob/main/CONTRIBUTING.md) — how to contribute

## License

[Apache-2.0](LICENSE)
