# OAP — Open Agent Protocol

CQRS and Event Sourcing give you a clean, scalable architecture. But there is no common way to discover what commands a service accepts, what events it produces, or how to interact with it — without reading bespoke documentation or source code.

OAP is a specification for service interoperability — how domain services expose their command ingestion surface and event log, how callers (AI agents, Process Managers, UIs, other services) discover and interact with them, and how execution is observed — across any runtime, platform, language, or transport.

OAP doesn't care how a service works internally. It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

If you are new to OAP, start with the [Overview](specs/overview.md) for the protocol's goals and design, then explore [Discovery](specs/discovery.md) and the [Agent capabilities](specs/agents/registry.md).

## OAP Documents

|  | Pre-release | WIP |
|---|:---:|:---:|
| **Core Specification:** | | |
| [OAP Overview](specs/overview.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/overview.md) | [WIP](specs/overview.md) |
| [Discovery](specs/discovery.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/discovery.md) | [WIP](specs/discovery.md) |
| [Versioning](specs/versioning.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/versioning.md) | [WIP](specs/versioning.md) |
| [Conformance](specs/conformance.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/conformance.md) | [WIP](specs/conformance.md) |
| | | |
| **Agent Capabilities:** | | |
| [Registry](specs/agents/registry.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/agents/registry.md) | [WIP](specs/agents/registry.md) |
| [Lifecycle](specs/agents/lifecycle.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/agents/lifecycle.md) | [WIP](specs/agents/lifecycle.md) |
| [Events](specs/agents/events.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/agents/events.md) | [WIP](specs/agents/events.md) |
| [Commands](specs/agents/commands.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/agents/commands.md) | [WIP](specs/agents/commands.md) |
| [Memory](specs/agents/memory.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/agents/memory.md) | [WIP](specs/agents/memory.md) |
| | | |
| **Observability:** | | |
| [Tracing](specs/observability/tracing.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/observability/tracing.md) | [WIP](specs/observability/tracing.md) |
| | | |
| **Transport Bindings:** | | |
| [REST](specs/transports/rest.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/transports/rest.md) | [WIP](specs/transports/rest.md) |
| [MCP](specs/transports/mcp.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/transports/mcp.md) | [WIP](specs/transports/mcp.md) |
| [A2A](specs/transports/a2a.md) | [v0.3.13](https://github.com/openagentprotocol/spec/blob/v0.3.13/specs/transports/a2a.md) | [WIP](specs/transports/a2a.md) |

> The most recent stable release is [v0.3.13](https://github.com/openagentprotocol/spec/releases/tag/v0.3.13).

## Protocol Artifacts

The machine-readable protocol definitions live under [`protocol/v1/`](protocol/v1/) and are the source of truth:

| Path | Contents |
|---|---|
| [`protocol/v1/schemas/`](protocol/v1/schemas/) | JSON Schema files for all capabilities |
| [`protocol/v1/services/`](protocol/v1/services/) | OpenAPI specs for REST transport |
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

## Cutting a Release

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
4. Create an annotated git tag (`v<version>`) and push it to `origin`.

## Community

- [Website & Documentation](https://openagentprotocol.io/)
- [GitHub Issues](https://github.com/openagentprotocol/spec/issues) — bug reports & feature requests
- [Contributing](https://github.com/openagentprotocol/spec/blob/main/CONTRIBUTING.md) — how to contribute

## License

[Apache-2.0](LICENSE)
