# MCP Transport

MCP (Model Context Protocol) lets any off-the-shelf LLM client interact with a BEST-compliant service — discovering commands and queries, reading state, sending commands — without any bespoke integration.

> Normative reference: [SPEC.md — MCP Transport](https://github.com/behavioralstate/spec/blob/main/SPEC.md#mcp-transport).

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

> **MCP is an adapter for clients you don't control — not the recommended path for code you own.** Every `best-mcp` tool is a thin wrapper over exactly one HTTP endpoint, so placing the MCP server between your own client and the service adds a network hop, flattens structured BEST errors into prose, and widens your supply chain — while providing nothing a small HTTP client in your own codebase wouldn't. Off-the-shelf MCP-capable clients (Claude Desktop, VS Code Copilot, Cursor, ChatGPT Desktop) use MCP because it is the only plug-in mechanism they offer. Rule of thumb: **never put `best-mcp` between a first-party client and a BEST service.**

## Mapping

| BEST Concept | MCP Tool |
|---|---|
| Connection list (multi-connection mode) | `list_connections` |
| Discovery manifest (`GET /.well-known/best`) | `get_manifest` |
| Command catalogue / schema / ingestion | `get_command_catalogue` · `get_command_schema` · `send_command` |
| Query catalogue / schema / execution | `get_query_catalogue` · `get_query_schema` · `execute_query` |
| Event history / schema (`GET /events`, `GET /events/{schema}/{version}`) | `get_events` · `get_event_schema` |
| Live event stream (`GET /events/stream`) | `sample_event_stream` — a bounded, client-side sample (see below) |
| Push event delivery | MCP server-to-client notifications |

> **Streams are sampled, not held.** An MCP tool call is request/response, and the LLM host's loop is turn-based — nothing re-invokes the model when an event arrives between turns. `sample_event_stream` therefore opens the SSE stream, collects until a `max_events`/`max_seconds` bound (enforced client-side, so any conformant endpoint works), and returns what arrived; the previous sample's `lastEventId` is passed as `Last-Event-ID` to resume without gaps where the server supports it. For past events, `get_events` polling with the response cursor is the turn-based drain. For standing reactions ("when X happens, do Y"), neither is right — agents should configure the service's own alerting/webhook commands instead.

`send_command` builds the CloudEvent envelope automatically: `type` from the schema name via PascalCase conversion, `dataschema` set to the absolute catalogue URI, `source` defaulting to the client's own identity (`urn:best-mcp`) — correct for conformant services, which never route on `source` alone.

## Reference Implementation — `best-mcp`

[`@behavioralstate/best-mcp`](https://www.npmjs.com/package/@behavioralstate/best-mcp) is the generic reference MCP server — point it at any BEST HTTP surface and it exposes the full command/query/event surface as MCP tools.

```bash
npx @behavioralstate/best-mcp
```

> **Pin a version in production.** Unversioned `npx` resolves `latest` at start-up — a server deployment then silently picks up new code (including any compromise of the npm package) on its next cold start, with your callers' credentials flowing through it. Pin an exact version and upgrade deliberately.

Configuration is env-var driven, three modes in priority order — per-app `BEST_<APP>_*` variables (recommended; `BASE_URL`, `API_KEY`, optional `TENANT_ID` which auto-generates `<app>/tenant` and `<app>/platform` connections, and `AUTH_TYPE`/`AUTH_HEADER`/`AUTH_IN`/`AUTH_PARAM`), a `BEST_CONNECTIONS` JSON array, or legacy single-connection `BEST_ENDPOINT`/`BEST_API_KEY`. Transport via `MCP_TRANSPORT` (`stdio` default, or `http` + `MCP_HTTP_PORT`). The full variable reference lives in the [package README](https://www.npmjs.com/package/@behavioralstate/best-mcp).

Example — stdio config for VS Code Copilot / Cursor / Claude Desktop:

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

For ChatGPT Desktop, run with `MCP_TRANSPORT=http`, expose the port via a tunnel, and register the `/mcp` URL as a connector.

## Manifest Declaration

The `mcp` block in a service's transports declares how to reach the MCP server. MCP is **optional** — HTTP is the baseline.

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "push": true,
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

| Field | Required | Description |
|---|---|---|
| `transport` | yes | `"stdio"`, `"sse"`, or `"http"` |
| `server` | yes | MCP server identifier or URL |
| `push` | no | `true` when the server supports server-to-client push notifications for domain events |
| `authentication` | no | Credentials for connecting to this MCP server — independent of the manifest's root `authentication` block (which covers the HTTP API); each transport declares its own requirements |

`authentication` carries `type` (`none`/`bearer`/`apiKey`/`oauth2`) plus, per type: `headers` (an array of `{ name, description, example }` descriptors — use it when more than one header is needed, e.g. API key + tenant ID; the `example` field lets tooling like VS Code pre-fill a ready-to-use MCP config from a per-tenant manifest), `scheme` for bearer, `tokenUrl`/`scopes` for OAuth2, and `docs` for the human-readable onboarding page.

## Push Event Delivery

When a caller maintains an active MCP session and `"push": true` is declared, the server **may** push domain events as MCP server-to-client notifications, matched by the **`correlationid`** of a previously submitted command. Callers should prefer this channel over polling `GET /events`. The events capability declares `"push": { "mcp": true }` when this channel is active — see [Discovery](../discovery.md#capability-entries).
