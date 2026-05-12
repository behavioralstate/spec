# MCP Transport

MCP (Model Context Protocol) allows any LLM client to interact with an OAP-compliant service directly — discovering commands and queries, reading state, and sending commands — without any bespoke integration.

<div class="oap-diagram">
  <div class="oap-node">
    <div class="oap-node-title">LLM Client</div>
    <div class="oap-node-box">Copilot / Claude / ChatGPT</div>
    <div class="oap-node-sub">any MCP-capable client</div>
  </div>
  <div class="oap-arrow">
    <div class="oap-arrow-label">MCP tools</div>
    <div class="oap-arrow-track">→</div>
  </div>
  <div class="oap-node">
    <div class="oap-node-title">oap-mcp</div>
    <div class="oap-node-box accent">MCP Server</div>
    <div class="oap-node-sub">stdio or http transport</div>
  </div>
  <div class="oap-arrow">
    <div class="oap-arrow-label">OAP HTTP</div>
    <div class="oap-arrow-track">→</div>
  </div>
  <div class="oap-node">
    <div class="oap-node-title">Service</div>
    <div class="oap-node-box">OAP Endpoint</div>
    <div class="oap-node-sub">any compliant API</div>
  </div>
</div>

## Mapping

| OAP Concept | MCP Concept |
|---|---|
| Command catalogue (`GET /commands`) | MCP tool: `get_command_catalogue` |
| Command schema (`GET /commands/{schema}/{version}`) | MCP tool: `get_command_schema` |
| Command ingestion (`POST /commands`) | MCP tool: `send_command` |
| Query catalogue (`GET /queries`) | MCP tool: `get_query_catalogue` |
| Query schema (`GET /queries/{schema}/{version}`) | MCP tool: `get_query_schema` |
| Query execution (`GET /queries/{schema}`) | MCP tool: `execute_query` |
| Push event delivery | MCP server-to-client notifications |

## Result

Any LLM client (ChatGPT Desktop, GitHub Copilot, Claude Desktop, Cursor) becomes a capable caller of any OAP-compliant service — with full command and query discovery, no hardcoded integration.

## Reference Implementation — `oap-mcp`

`oap-mcp` is the reference MCP server for OAP. It is generic — it works with any OAP-compliant endpoint. Point it at any OAP HTTP surface and it exposes the full command and query surface as MCP tools.

```bash
npx oap-mcp
```

### Configuration

| Variable | Required | Description |
|---|---|---|
| `OAP_ENDPOINT` | yes | Base URL of the OAP HTTP surface (e.g. `https://api.example.com/oap`) |
| `OAP_API_KEY` | yes | API key — sent as `Authorization: Bearer <key>` |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | no | HTTP port when `MCP_TRANSPORT=http` (default: `3000`) |

### stdio — VS Code Copilot, Cursor, Claude Desktop

```json
{
  "mcpServers": {
    "my-service": {
      "command": "npx",
      "args": ["oap-mcp"],
      "env": {
        "OAP_ENDPOINT": "https://api.example.com/oap",
        "OAP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### HTTP — ChatGPT Desktop

Start in HTTP mode and expose via a tunnel:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
  OAP_ENDPOINT=https://api.example.com/oap \
  OAP_API_KEY=<key> \
  npx oap-mcp

ngrok http 3001
```

Then in ChatGPT Desktop: **Settings → Apps & Connectors → Create**, connector URL: `https://<subdomain>.ngrok.app/mcp`

### Intended LLM flow

```
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
- `dataschema` is set to the relative URI `{schema}/{version}` (e.g. `configure-broker/1.0`)
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

MCP transport is **optional** — HTTP is the baseline. MCP is declared in the `/.well-known/oap` manifest only if the endpoint supports it.

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

When `"push": true` is present, callers **should** prefer this channel over polling `GET /events`. The `io.oap.agents.events` capability in the manifest declares `"push": { "mcp": true }` when this channel is active — see [Discovery](../discovery.md#push-channel-declaration).
