# Discovery — `/.well-known/best`

The manifest describes the services, capabilities, transport bindings, and authentication requirements. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Consumer</div>
    <div class="BEST-node-box">Any Client</div>
    <div class="BEST-node-sub">LLM · agent · app</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">GET /.well-known/best</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Manifest</div>
    <div class="BEST-node-box accent">BEST Endpoint</div>
    <div class="BEST-node-sub">capabilities · auth · schemas</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">Start interacting</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">APIs</div>
    <div class="BEST-node-box">Commands &amp; Queries</div>
    <div class="BEST-node-sub">no config required</div>
  </div>
</div>

**From SPEC.md:** [Discovery](https://github.com/behavioralstate/spec/blob/main/SPEC.md#discovery--well-knownbest)

## The manifest's shape

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "authentication": { ... },
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
```

The four standard capabilities are `io.best.agents.commands`, `io.best.agents.events`, `io.best.agents.queries`, and `io.best.agents.workflows`.

The events capability's entry declares its push channels:

```json
"push": { "sse": true, "mcp": true }
```

| Field | Description |
|---|---|
| `push.sse` | SSE stream supported at `GET /events/stream` |
| `push.mcp` | Server-to-client MCP notifications supported — see [MCP transport](transports/mcp.md) |

For a registry built as an ordinary domain, see the [worked example](composing-processes.md#worked-example-a-service-registry-with-heartbeat).

## Who uses each transport

```json
"http": { "endpoint": "https://api.example.com/" },
"mcp":  { "transport": "stdio", "server": "best-mcp" }
```

| Transport | Primary consumer | Protocol |
|---|---|---|
| **HTTP** | Web UIs, traditional services, monitoring tools | HTTP/JSON |
| **MCP** | LLM clients (ChatGPT, Copilot, Gemini, Claude) | JSON-RPC over stdio/SSE |

## Multi-Tenancy

**From SPEC.md:** [Multi-Tenancy](https://github.com/behavioralstate/spec/blob/main/SPEC.md#multi-tenancy)

Per-tenant manifests pay off even when all tenants share one capability surface: the tenant's `http.endpoint` structurally encodes the scope into every path (auditable at the infrastructure layer), `dataschema` URIs need no caller-side substitution, and an organisation's members share one manifest and key.

For the first-contact algorithm — what to read, what to collect from the user, and when to fetch the tenant manifest — see [SPEC.md — Agent Navigation Guide](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-navigation-guide).
