# MCP Transport

MCP (Model Context Protocol) allows any LLM client to interact with a BEST-compliant service directly — discovering commands and queries, reading state, and sending commands — without any bespoke integration.

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">LLM Client</div>
    <div class="BEST-node-box">Copilot / Claude / ChatGPT</div>
    <div class="BEST-node-sub">any MCP-capable client</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">MCP tools</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">best-mcp</div>
    <div class="BEST-node-box accent">MCP Server</div>
    <div class="BEST-node-sub">stdio or http transport</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">BEST HTTP</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Service</div>
    <div class="BEST-node-box">BEST Endpoint</div>
    <div class="BEST-node-sub">any compliant API</div>
  </div>
</div>

## Choosing a Transport

> **MCP is an adapter for clients you don't control — not the recommended path for code you own.** HTTP is the baseline transport, and the BEST HTTP surface is deliberately self-describing: catalogues, schemas and workflows are designed to be consumed by an agent directly, with no adapter in between.
>
> - **Off-the-shelf MCP-capable client** (Claude Desktop, VS Code Copilot, Cursor, ChatGPT Desktop, CLI agents): use MCP. It is the only plug-in mechanism those clients offer, and `best-mcp` gives them the full command/query surface with zero bespoke code.
> - **Your own code** (a bespoke agent, a backend, tooling you build and deploy): call the BEST HTTP surface directly. Every `best-mcp` tool is a thin wrapper over exactly one HTTP endpoint, so placing the MCP server between your own client and the service adds a network hop and a deployment to operate, flattens structured BEST error responses (HTTP status + error code) into prose strings, and widens your supply chain — while providing nothing a small HTTP client in your own codebase wouldn't.
>
> Rule of thumb: **never put `best-mcp` between a first-party client and a BEST service.** Declaring the `mcp` transport in your manifest is for the consumers you don't ship code to.

## Mapping

| BEST Concept | MCP Concept |
|---|---|
| Connection list (multi-connection mode) | MCP tool: `list_connections` |
| Command catalogue (`GET /commands`) | MCP tool: `get_command_catalogue` |
| Command schema (`GET /commands/{schema}/{version}`) | MCP tool: `get_command_schema` |
| Command ingestion (`POST /commands`) | MCP tool: `send_command` |
| Query catalogue (`GET /queries`) | MCP tool: `get_query_catalogue` |
| Query schema (`GET /queries/{schema}/{version}`) | MCP tool: `get_query_schema` |
| Query execution (`GET /queries/{schema}`) | MCP tool: `execute_query` |
| Push event delivery | MCP server-to-client notifications |

## Result

Any LLM client (ChatGPT Desktop, GitHub Copilot, Claude Desktop, Cursor) becomes a capable caller of any BEST-compliant service — with full command and query discovery, no hardcoded integration.

## Reference Implementation — `best-mcp`

`best-mcp` is the reference MCP server for BEST. It is generic — it works with any BEST-compliant endpoint. Point it at any BEST HTTP surface and it exposes the full command and query surface as MCP tools.

```bash
npx @behavioralstate/best-mcp
```

> **Pin a version in production.** Unversioned `npx @behavioralstate/best-mcp` resolves `latest` from npm at start-up — convenient on a workstation, but a server deployment then silently picks up new code (including any compromise of the npm package) on its next cold start, with your callers' credentials flowing through it. Production deployments should pin an exact version (e.g. `npx @behavioralstate/best-mcp@1.7.0`) and upgrade deliberately.

### Configuration

`best-mcp` supports three configuration modes, checked in priority order.

---

#### Mode 1 — Per-app env vars *(recommended)*

One set of `BEST_<APP>_*` variables per application. The app name must be a single uppercase word (letters and digits only, e.g. `TRADING`, `HR`).

**Required:**

| Variable | Description |
|---|---|
| `BEST_<APP>_BASE_URL` | Root URL of the BEST HTTP surface |
| `BEST_<APP>_API_KEY` | Credential — not required when `AUTH_TYPE=none` |

**Optional:**

| Variable | Default | Description |
|---|---|---|
| `BEST_<APP>_TENANT_ID` | — | When set, auto-generates two named connections: `<app>/tenant` → `BASE_URL/tenants/TENANT_ID` and `<app>/platform` → `BASE_URL`. When omitted, generates one connection: `<app>`. |
| `BEST_<APP>_AUTH_TYPE` | `apikey`* | `bearer` · `apikey` · `none` — **defaults to `apikey` in Mode 1** (Modes 2 & 3 default to `bearer`) |
| `BEST_<APP>_AUTH_HEADER` | `X-Api-Key` | Header name when `AUTH_TYPE=apikey` and `AUTH_IN=header` |
| `BEST_<APP>_AUTH_IN` | `header` | `header` or `query` — where the key is sent when `AUTH_TYPE=apikey` |
| `BEST_<APP>_AUTH_PARAM` | `apikey` | Query parameter name when `AUTH_IN=query` |

**Auth types:**

> **Default differs by mode.** Mode 1 defaults to `apikey` because BEST services typically use API key headers. Modes 2 and 3 default to `bearer` for backward compatibility.

| `AUTH_TYPE` | Credential transport | Extra vars |
|---|---|---|
| `apikey` *(Mode 1 default)* | Custom header (default `X-Api-Key`) or query param | `AUTH_HEADER` or `AUTH_IN=query` + `AUTH_PARAM` |
| `bearer` *(Modes 2 & 3 default)* | `Authorization: Bearer <key>` | none |
| `none` | No credentials | `API_KEY` not required |

Example — admin with tenant + platform surfaces (generates two connections from one config block):

```
BEST_TRADING_BASE_URL=https://api.example.com/best
BEST_TRADING_API_KEY=your-api-key
BEST_TRADING_TENANT_ID=your-tenant-id
BEST_TRADING_AUTH_TYPE=apikey
```

Connections produced: `trading/tenant` and `trading/platform`.

---

#### Mode 2 — `BEST_CONNECTIONS` JSON array

For cases where per-app vars are not flexible enough. Set `BEST_CONNECTIONS` to a JSON array of fully-explicit connection objects (`name`, `endpoint`, `apiKey`, `authType`, `authHeader`, `authIn`, `authParam`, `description`).

---

#### Mode 3 — Legacy single connection

For simple single-endpoint setups. Set `BEST_ENDPOINT`, `BEST_API_KEY`, and optionally `BEST_AUTH_TYPE`, `BEST_AUTH_HEADER`, `BEST_AUTH_IN`, `BEST_AUTH_PARAM`.

---

**Transport vars (all modes):**

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `MCP_HTTP_PORT` | `3000` | HTTP port when `MCP_TRANSPORT=http` |

### stdio — VS Code Copilot, Cursor, Claude Desktop

```json
{
  "mcpServers": {
    "best": {
      "command": "npx",
      "args": ["@behavioralstate/best-mcp"],
      "env": {
        "BEST_TRADING_BASE_URL": "https://api.example.com/best",
        "BEST_TRADING_API_KEY": "<your-api-key>",
        "BEST_TRADING_TENANT_ID": "<your-tenant-id>",
        "BEST_TRADING_AUTH_TYPE": "apikey"
      }
    }
  }
}
```

For multiple apps, add more `BEST_<APP>_*` variable groups to the same `env` block.

### HTTP — ChatGPT Desktop

Start in HTTP mode and expose via a tunnel:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
  BEST_ENDPOINT=https://api.example.com/BEST \
  BEST_API_KEY=<key> \
  npx @behavioralstate/best-mcp

ngrok http 3001
```

Then in ChatGPT Desktop: **Settings → Apps & Connectors → Create**, connector URL: `https://<subdomain>.ngrok.app/mcp`

### Intended LLM flow

```
list_connections (multi-connection only) → identify and confirm the target connection

get_command_catalogue          → discover what commands this service accepts
get_command_schema             → learn the exact fields and the required source value
send_command                   → send the command (CloudEvent envelope built automatically)

get_query_catalogue            → discover available read queries
get_query_schema               → learn parameters and response shape
execute_query                  → read current state synchronously
```

### CloudEvent construction

`send_command` builds the CloudEvent 1.0 envelope automatically:
- `type` is derived from the schema name via PascalCase conversion (`configure-broker → ConfigureBroker`)
- `dataschema` is set to the absolute catalogue URI `{endpoint}/commands/{schema}/{version}` (e.g. `https://api.example.com/best/commands/configure-broker/1.0`)
- `source` must be supplied by the caller — the required value is documented in the schema `description` returned by `get_command_schema`; never invent or default it

## Transport Configuration

The `mcp` block in the service definition declares how to reach the MCP server:

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `transport` | string | yes | MCP transport type: `"stdio"`, `"sse"`, or `"http"` |
| `server` | string | yes | MCP server identifier or URL |
| `push` | boolean | no | When `true`, the server supports server-to-client push notifications for domain events. Callers should prefer this channel over polling `GET /events`. |
| `authentication` | object | no | Authentication requirements for connecting to this MCP server |

MCP transport is **optional** — HTTP is the baseline. MCP is declared in the `/.well-known/best` manifest only if the endpoint supports it.

## Authentication

If the MCP server requires authentication, it declares this in an `authentication` block on the `mcp` transport object. Consumers — including AI agents and IDE tooling such as VS Code Copilot — **must** read this block to know what credentials to supply when connecting.

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "authentication": {
    "type": "apiKey",
    "headers": [
      { "name": "X-Api-Key",   "description": "Your API key" },
      { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
    ],
    "docs": "https://docs.example.com/authentication"
  }
}
```

### Authentication Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | One of: `"none"`, `"bearer"`, `"apiKey"`, `"oauth2"` |
| `headers` | array | no | Required headers for `apiKey` type — use when more than one header is needed (e.g. both an API key and a tenant ID). For single-header API key auth, `headers` with one entry is preferred over `scheme` + `in`. |
| `scheme` | string | no | For `bearer`: the `Authorization` header prefix (e.g. `"Bearer"`) |
| `tokenUrl` | string | no | Token endpoint URL for `oauth2` or token-based flows |
| `scopes` | string[] | no | Required OAuth2 / token scopes |
| `docs` | string | no | URL to human-readable authentication documentation |

### Header Descriptor

Each entry in `headers` describes one required HTTP header:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | HTTP header name (e.g. `"X-Api-Key"`) |
| `description` | string | no | Human-readable description of what value to supply |
| `example` | string | no | Pre-filled example value. Tooling may use this to populate the header automatically — for instance, a per-tenant manifest may pre-fill the resolved tenant ID here so VS Code can generate a complete MCP server config without manual input. |

### Auth Type Examples

**API key — single header:**

```json
"authentication": {
  "type": "apiKey",
  "headers": [
    { "name": "X-Api-Key", "description": "Your API key" }
  ],
  "docs": "https://docs.example.com/auth"
}
```

**API key — multiple headers (e.g. key + tenant ID):**

```json
"authentication": {
  "type": "apiKey",
  "headers": [
    { "name": "X-Api-Key",   "description": "Your API key" },
    { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
  ],
  "docs": "https://docs.example.com/auth"
}
```

**Bearer token:**

```json
"authentication": {
  "type": "bearer",
  "scheme": "Bearer",
  "docs": "https://docs.example.com/auth"
}
```

**OAuth2:**

```json
"authentication": {
  "type": "oauth2",
  "tokenUrl": "https://auth.example.com/oauth2/token",
  "scopes": ["mcp:read", "mcp:write"],
  "docs": "https://docs.example.com/auth"
}
```

> **Tooling hint:** The `example` field on a header is intended for IDE tooling (e.g. VS Code Copilot's MCP server config). When consuming a per-tenant manifest, `example` values may be pre-filled so tooling can generate a ready-to-use MCP server config with no manual entry required.

> **MCP authentication vs. root authentication.** The root `authentication` block in the manifest describes credentials for the HTTP API. The `mcp.authentication` block describes credentials for the MCP server specifically. These may use the same mechanism or different ones — each transport declares its own requirements independently.

## Push Event Delivery

When a caller maintains an active MCP session and `"push": true` is declared on the `mcp` block, the server **may** push domain events to the caller using MCP's server-to-client notification mechanism. Events are delivered as MCP notifications matched by the correlation identifier of a previously submitted command.

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "push": true
}
```

When `"push": true` is present, callers **should** prefer this channel over polling `GET /events`. The `io.best.agents.events` capability in the manifest declares `"push": { "mcp": true }` when this channel is active — see [Discovery](../discovery.md#push-channel-declaration).
