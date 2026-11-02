# MCP Transport

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

**From SPEC.md:** [MCP Transport](https://github.com/behavioralstate/spec/blob/main/SPEC.md#mcp-transport)

## Further tools

`best-mcp` also exposes the discovery manifest (`get_manifest`), event history and schemas (`get_events`, `get_event_schema`) and a bounded sample of the live stream (`sample_event_stream`). Its `send_command` defaults `source` to the client's own identity (`urn:best-mcp`) unless the caller sets it.

> **Streams are sampled, not held.** An MCP tool call is request/response, and the LLM host's loop is turn-based — nothing re-invokes the model when an event arrives between turns. `sample_event_stream` therefore opens the SSE stream, collects until a `max_events`/`max_seconds` bound (enforced client-side, so any conformant endpoint works), and returns what arrived; the previous sample's `lastEventId` is passed as `Last-Event-ID` to resume without gaps where the server supports it. For past events, `get_events` polling with the response cursor is the turn-based drain. For standing reactions ("when X happens, do Y"), neither is right — agents should configure the service's own alerting/webhook commands instead.

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

### What a conforming MCP client owes the model

A model can only follow what the client lets it reach. Three obligations follow from the manifest itself, and `best-mcp` (2.3.5+) implements each:

- **Every service the root manifest lists is reachable.** A configuration names one tenant surface, but `/.well-known/best` may list further services — typically an anonymous onboarding surface. The client resolves `<app>/<serviceId>` to that service's `http.endpoint` on demand (root manifest fetched once, then cached) and lists such services next to the configured connections; the model never needs a configuration change to reach a service the manifest already names.
- **Error bodies arrive whole.** A service's `error.code` and `error.details` are where recovery lives (a rejected key's 401 names the onboarding surface there); a client that forwards only the sentence turns a recoverable state into a dead end.
- **The token URL is usable.** `authentication.tokenUrl` exists because the credential hand-off cannot be a command (asynchronous, no result) or a query (a secret in a URL). The client exposes it as a tool — `exchange_device_code` for the RFC 8628 device-authorization grant that agent self-onboarding uses — treats `authorization_pending` / `slow_down` as a status to poll on, and applies an issued credential (and tenant) to the session's connections at once, so the model's next call already works.
- **Secrets never reach the model.** The client stores an issued credential itself (user-only file, keyed by the service's base URL, reconciled with the configuration at startup) and redacts it from every tool result. The entries of one account — the service's origin plus the tenant — are one credential whatever they are filed under: on a service that holds one key per account, a configured key that was replaced heals from a stored sign-in of the same account on its first 401, and a key issued on any entry is written to all of them, so one approval repairs every client on the machine. A model that is handed a key pastes it into the conversation, and a transcript is not a secret store. A person who needs the key elsewhere mints one on the service's own page.

The server-side counterpart is in [`agents/workflows`](../agents/workflows.md): a service that offers self-onboarding publishes it as a workflow on an anonymous surface listed in the root manifest.

## The `mcp` block's fields

`push` is `true` when the server supports server-to-client push notifications for domain events.

`authentication` carries `type` (`none`/`bearer`/`apiKey`/`oauth2`) plus, per type: `headers` (an array of `{ name, description, example }` descriptors), `scheme` for bearer, `tokenUrl`/`scopes` for OAuth2, and `docs` for the human-readable onboarding page.

## Push Event Delivery

When a caller maintains an active MCP session and `"push": true` is declared, the server **may** push domain events as MCP server-to-client notifications, matched by the **`correlationid`** of a previously submitted command. Callers should prefer this channel over polling `GET /events`. The events capability declares `"push": { "mcp": true }` when this channel is active — see [Discovery](https://github.com/behavioralstate/spec/blob/main/SPEC.md#capability-entries).
