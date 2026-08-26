# BEST — Behavioral State Protocol

When an organisation deploys multiple AI agents, a problem follows: how do those agents discover capabilities across heterogeneous systems, express intent, observe the resulting events, and correlate outcomes — without every integration becoming bespoke? There is no common way to learn what commands a system accepts, what events it produces, or how to interact with it, short of reading its documentation or source code.

BEST is an open specification for **capability discovery and behavioural interoperability** in distributed and agentic systems. Each system exposes its behaviour as one machine-understandable manifest; any caller — an AI agent, a Process Manager, a UI, another service — discovers its capabilities, expresses intent through **commands**, reads current state through **queries**, observes the resulting **events**, and correlates outcomes across services via a first-class correlation identifier. BEST doesn't care how a system works internally; it defines only the interaction surface, across any runtime, platform, language, or transport.

## Documentation

**[SPEC.md](SPEC.md)** is the consolidated specification — the whole protocol in one document: design, discovery, commands, events, queries, transports, conformance, and security. Start there.

The same content is browsable per-topic at [behavioralstate.io](https://behavioralstate.io/), rendered from the pages under [`specs/`](specs/).

Upgrading an implementation from 0.8.x? See [MIGRATION.md](MIGRATION.md) — 0.9.0 renamed the protocol short name (BSP → BEST) and made the envelope a conformant CloudEvents 1.0 profile.

For what's done, in flight, and planned — including the IANA/RFC standards track — see [ROADMAP.md](ROADMAP.md).

> The most recent stable release is [v0.9.4](https://github.com/behavioralstate/spec/releases/tag/spec/v0.9.4). To read the spec exactly as released, browse the repo at tag [v0.9.4](https://github.com/behavioralstate/spec/blob/spec/v0.9.4/README.md); the `main` branch is the work in progress.

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

Per-app `BEST_<APP>_*` variables are the recommended configuration mode (default auth: `X-Api-Key` header). Multi-tenant endpoints, multiple connections, bearer/query-param auth, HTTP transport for ChatGPT Desktop, and per-request credential overrides are all covered in the [mcp-server README](mcp-server/README.md). Production deployments should pin an exact version (e.g. `@behavioralstate/best-mcp@2.0.0`).

## best-validate — Conformance Validator

`best-validate` runs the spec's [conformance checklist](SPEC.md#conformance) against any live endpoint: it fetches the discovery manifest and validates it against the published JSON Schemas, checks the capability declaration rules, probes every required endpoint of each `active` capability, and verifies the error format and auth enforcement. All probes are non-destructive — the only POST sent is a command with an intentionally unknown `type`, which a conformant endpoint rejects before queuing.

```bash
# Public endpoint
npx @behavioralstate/best-validate https://api.example.com

# Authenticated endpoint (X-Api-Key by default; see --auth-type/--auth-header)
npx @behavioralstate/best-validate https://api.example.com --api-key <key>

# Multi-tenant host — expands tenants.manifest and validates the tenant manifest too
npx @behavioralstate/best-validate https://api.example.com --api-key <key> --tenant <tenantId>

# CI usage — machine-readable report, exit code as the verdict
npx @behavioralstate/best-validate https://api.example.com --json
```

The report lists each check as `OK`/`WARN`/`FAIL` grouped by section (discovery, multi-tenancy, commands, events, queries) and ends with a verdict. Exit code `0` = conformant (warnings allowed), `1` = at least one failure, `2` = internal error. Without `--api-key`, protected routes are still checked for existence — a `401` counts as "route exists, auth enforced".

Full option reference: [validate-cli/README.md](validate-cli/README.md).

## Cutting a Release

This repo has **three independent** versioned artifacts. Running one release does not release the others. Always use the scripts — never tag manually (the one exception is the legacy 1.x MCP line, below).

| Artifact | Tag prefix | Command | Outcome |
|---|---|---|---|
| `@behavioralstate/best-mcp` npm package | `mcp/v*` | `./scripts/release-mcp.sh [x.y.z]` | CI publishes to npm |
| `@behavioralstate/best-validate` npm package | `validate/v*` | `./scripts/release-validate.sh [x.y.z]` | CI publishes to npm |
| BEST protocol spec + website | `spec/v*` | `./scripts/release.sh x.y.z [--prerelease]` | CI builds the site image → GHCR → IaC deploy PR |

`release-mcp.sh` with no argument auto-bumps the patch version. `release.sh` requires a clean `main` checkout, bumps `version.json` (the single source of truth for `{{BEST_VERSION}}` placeholders), updates this README's release references, tags, and creates the GitHub Release. When releasing both in one session, release `best-mcp` first.

**The tag prefix does not select the npm package.** CI checks out the tagged commit and publishes whatever `mcp-server/package.json` names *there*, so package identity comes from the commit, not the tag.

### Legacy `@behavioralstate/bsp-mcp` (1.x)

The MCP server was published as `@behavioralstate/bsp-mcp` before the BSP → BEST rename. Deployments still pinned to that package are maintained on a branch cut from the `mcp/v1.7.1` tag and released by tagging **manually** — the one exception to "always use the scripts":

```bash
git tag -a mcp/v1.7.2 -m "Release mcp/v1.7.2" <commit> && git push origin mcp/v1.7.2
```

`release-mcp.sh` cannot cut a 1.x release, and **must not be used to try**. It requires `main`, where `mcp-server/package.json` is `@behavioralstate/best-mcp` — so tagging `mcp/v1.x` from `main` would publish **best-mcp** at that version, and because CI's `npm publish` passes no `--tag`, that moves best-mcp's `latest` *backwards*.

Fixes that apply to both lines get released on both. Verify either release by packing the published tarball (`npm pack <package>@<version>`) and checking `package/dist/index.js` — `dist/` is gitignored yet ships, so the artifact depends on a build having run.

## Community

- [Website & Documentation](https://behavioralstate.io/)
- [GitHub Issues](https://github.com/behavioralstate/spec/issues) — bug reports & feature requests
- [Contributing](https://github.com/behavioralstate/spec/blob/main/CONTRIBUTING.md) — how to contribute

## License

[Apache-2.0](LICENSE)
