# BSP � Behavioral State Protocol (spec repo)

The authoritative protocol documentation lives in `specs/`. Do not duplicate it here.
Read `specs/` to understand the protocol. These instructions cover only repo conventions and tooling.

## Repo Layout

| Path | Contents |
|---|---|
| `specs/` | Canonical spec documents (Markdown) � the source of truth |
| `protocol/v1/schemas/` | JSON Schema files for all capabilities |
| `protocol/v1/services/` | OpenAPI specs for the HTTP transport |
| `protocol/v1/examples/` | Example manifests and payloads |
| `website/` | SvelteKit documentation site |
| `scripts/` | Release and validation scripts |
| `mcp-server/` | Generic BSP MCP server (`bsp-mcp`) |

## Commands

```sh
# Validate protocol schemas
node scripts/validate-schemas.mjs

# Validate example payloads
node scripts/validate-examples.mjs

# Run website locally
cd website && npm install && npm run dev

# Build MCP server
cd mcp-server && npm install && npm run build
```

## Version Stamping

- **Single source of truth**: `version.json` at repo root
- Spec and example files use the placeholder `{{BSP_VERSION}}` � never hardcode a version string
- Files using the placeholder: `protocol/v1/examples/well-known-BSP.json`, `protocol/v1/services/agents/openapi.json`, `specs/versioning.md`, `specs/overview.md`, `specs/discovery.md`
- Stamping at build time: `website/scripts/copy-protocol.mjs` replaces `{{BSP_VERSION}}` when copying `protocol/v1/` ? `website/static/v1/`

## Cutting a Release

```sh
./scripts/release.sh 1.0.0              # stable
./scripts/release.sh 1.1.0 --prerelease # pre-release
```

The script bumps `version.json`, commits, tags, and pushes. Never manually edit version strings.

## MCP Server (`mcp-server/`)

Generic MCP server for **any** BSP-compliant endpoint. Published to npm as `bsp-mcp`.

> **`bsp-mcp` must stay implementation-agnostic.** It works with any BSP endpoint — do not hardcode headers, paths, or auth schemes specific to a single service. Authentication is fully configurable via environment variables; the defaults follow the BSP HTTP transport spec.

### Environment variables

Three configuration modes, checked in priority order:

#### Mode 1 — Per-app env vars *(recommended)*

One `BSP_<APP>_*` block per application. App name = single uppercase word (letters and digits, no underscores).

**Required per app:**

| Variable | Description |
|---|---|
| `BSP_<APP>_BASE_URL` | Root URL of the BSP HTTP surface |
| `BSP_<APP>_API_KEY` | Credential — not required when `AUTH_TYPE=none` |

**Optional per app:**

| Variable | Default | Description |
|---|---|---|
| `BSP_<APP>_TENANT_ID` | — | When set, auto-generates two connections: `<app>/tenant` and `<app>/platform`. When omitted, generates one: `<app>`. |
| `BSP_<APP>_AUTH_TYPE` | `bearer` | `bearer` · `apikey` · `none` |
| `BSP_<APP>_AUTH_HEADER` | `X-Api-Key` | Header name when `AUTH_TYPE=apikey`, `AUTH_IN=header` |
| `BSP_<APP>_AUTH_IN` | `header` | `header` or `query` |
| `BSP_<APP>_AUTH_PARAM` | `apikey` | Query param name when `AUTH_IN=query` |

**Auth types:** Mode 1 defaults to `apikey` (BSP services typically use API key headers). Modes 2 & 3 default to `bearer` for backward compatibility. Values: `apikey` → custom header (`X-Api-Key`) or query param · `bearer` → `Authorization: Bearer <key>` · `none` → no credentials.

#### Mode 2 — `BSP_CONNECTIONS` JSON array

Set `BSP_CONNECTIONS` to a JSON array of fully-explicit connection objects. Each object: `name`, `endpoint`, `apiKey`, `authType`, `authHeader`, `authIn`, `authParam`, `description` (optional).

#### Mode 3 — Legacy single connection

`BSP_ENDPOINT` + `BSP_API_KEY` + optional `BSP_AUTH_TYPE`, `BSP_AUTH_HEADER`, `BSP_AUTH_IN`, `BSP_AUTH_PARAM`.

**Transport (all modes):** `MCP_TRANSPORT` (`stdio` default · `http`) · `MCP_HTTP_PORT` (default `3000`).

### Tools exposed

`list_connections` (only when multiple connections configured), `get_command_catalogue`, `get_command_schema`, `send_command`, `send_command_and_wait`, `get_query_catalogue`, `get_query_schema`, `execute_query`.

`send_command` derives the CloudEvent `type` via PascalCase conversion of the schema name (`configure-broker → ConfigureBroker`). The `source` value must be read from the schema description — never invented.

### Publishing

Never tag `mcp/v*` manually — use the release script:
```sh
./scripts/release-mcp.sh <x.y.z>
```

