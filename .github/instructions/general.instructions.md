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

| Variable | Required | Default | Description |
|---|---|---|---|
| `BSP_ENDPOINT` | yes | — | Base URL of the BSP HTTP surface |
| `BSP_API_KEY` | yes* | — | Credential value (*not required when `BSP_AUTH_TYPE=none`) |
| `BSP_AUTH_TYPE` | no | `bearer` | `bearer` · `apikey` · `none` |
| `BSP_AUTH_HEADER` | no | `X-Api-Key` | Header name when `BSP_AUTH_TYPE=apikey` and `BSP_AUTH_IN=header` |
| `BSP_AUTH_IN` | no | `header` | `header` or `query` — where the key is sent when `BSP_AUTH_TYPE=apikey` |
| `BSP_AUTH_PARAM` | no | `apikey` | Query parameter name when `BSP_AUTH_IN=query` |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `MCP_HTTP_PORT` | no | `3000` | HTTP port when `MCP_TRANSPORT=http` |

Auth type maps directly to the `authentication.type` block in `/.well-known/bsp` — see `specs/discovery.md`.

### Tools exposed

`get_command_catalogue`, `get_command_schema`, `send_command`, `send_command_and_wait`, `get_query_catalogue`, `get_query_schema`, `execute_query`.

`send_command` derives the CloudEvent `type` via PascalCase conversion of the schema name (`configure-broker → ConfigureBroker`). The `source` value must be read from the schema description — never invented.

### Publishing

Never tag `mcp/v*` manually — use the release script:
```sh
./scripts/release-mcp.sh <x.y.z>
```

