# Discovery — `/.well-known/oap`

**Version:** 2026-04-10

Every OAP-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/oap
Content-Type: application/json
```

This returns a JSON manifest describing the available agents, services, capabilities, and transport bindings. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

> **Content-Type:** The response **must** use `Content-Type: application/json`. Consumers must not assume a `.json` file extension on the URL. The path `/.well-known/oap` is canonical. Implementations **may** also serve `/.well-known/oap.json` as an alias (for compatibility with static file hosts), but this is not required and consumers must not rely on it.

## Discovery Flow

1. Consumer hits `/.well-known/oap`
2. Reads the structured manifest
3. Discovers available services, capabilities, transport bindings, and authentication requirements
4. If `authentication.type` is not `none`, obtains credentials before calling API endpoints
5. Starts interacting without any hard-coded integration

## Manifest Structure

```
/.well-known/oap                   → what can I do? (discovery)
/schemas/event.json                → what does an event look like? (contract)
/specs/agents/event-delivery       → how does event delivery work? (documentation)
```

## Manifest Root

```json
{
  "oap": {
    "version": "2025-07-01",
    "authentication": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "services": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | OAP spec version (date-based: `"YYYY-MM-DD"`) |
| `authentication` | object | no | Authentication requirements for this endpoint (omit for public endpoints) |
| `services` | object | yes | Service definitions with transport bindings |
| `capabilities` | array | yes | Supported capabilities with schema URLs |
| `services` | array | no | Snapshot of known services (discovery hint only — see below) |

## Authentication

If an endpoint requires authentication, it declares this in the `authentication` block. Consumers **must** read this block before making any API calls.

```json
"authentication": {
  "type": "bearer",
  "scheme": "Bearer",
  "scopes": ["oap:read", "oap:write"],
  "tokenUrl": "https://auth.example.com/oauth2/token",
  "docs": "https://docs.example.com/authentication"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | One of: `"none"`, `"bearer"`, `"apiKey"`, `"oauth2"` |
| `scheme` | string | no | Authorization header value prefix (e.g. `"Bearer"`) |
| `in` | string | no | Where the API key is passed: `"header"` or `"query"` (for `apiKey` type) |
| `scopes` | string[] | no | Required OAuth2 / token scopes |
| `tokenUrl` | string | no | Token endpoint URL for OAuth2 or token-based flows |
| `docs` | string | no | URL to human-readable authentication documentation |

The `/.well-known/oap` endpoint itself is always publicly accessible without credentials so consumers can read the manifest. All other endpoints may require authentication as declared.

## Services

Services are top-level domains. Each service has its own version, spec URL, and transport bindings.

| Service | Namespace | Description |
|---|---|---|
| Agents | `io.oap.agents` | Service registry, command ingestion, event log |
| Observability | `io.oap.observability` | Execution traces and audit trail |

## Capabilities

Capabilities are composable building blocks within a service.

| Capability | Description | Extends |
|---|---|---|
| `io.oap.agents.registry` | Register, remove, list, get services | — |
| `io.oap.agents.lifecycle` | Pause and resume services | `agents.registry` |
| `io.oap.agents.events` | List published domain events, inject events for simulation | — |
| `io.oap.agents.commands` | Discover available commands (catalogue), send commands (ingestion) | — |
| `io.oap.agents.memory` | View service memory state | `agents.registry` |
| `io.oap.observability.tracing` | Execution traces | — |

Each capability object has these fields:

| Field | Description |
|---|---|
| `name` | Fully qualified capability identifier (e.g. `io.oap.agents.registry`) |
| `version` | Date-based version string |
| `description` | Human-readable summary |
| `spec` | URL to the capability specification page |
| `schema` | URL to the **JSON Schema** for this capability's data structures — e.g. `registry.json`, `events.json`. This is a JSON Schema file, not an OpenAPI spec. Do not confuse with `rest.openapi` (see Transport Bindings below). |
| `service` | Key of the implementing service in the manifest's `services` object (e.g. `"io.oap.agents"`, `"io.dotquant.trading"`). Required when the capability's name prefix does not match the service key — for example, a custom service implementing a standard OAP capability. Consumers use this to resolve which `rest.endpoint` to call for the capability's endpoints. |
| `status` | `active`, `partial`, or `planned` (omitted means active) |
| `extends` | Parent capability name, if this extends another |
| `endpoints` | Machine-readable list of HTTP endpoints exposed by this capability. Paths are relative to `rest.endpoint`. Each entry has a `method` (GET/POST/DELETE/etc.) and a `path`. The HTTP method signals whether the operation is a read (GET) or a write (POST/DELETE/etc.). Consumers use this to discover catalogue URLs and determine mutability without reading the spec page. |

### Capability Status

Each capability in the manifest may declare a `status` field:

| `status` | Meaning | Consumer behaviour |
|---|---|---|
| `"active"` (or omitted) | Fully implemented | All required endpoints exist and are callable |
| `"partial"` | Subset implemented | Some required endpoints may be missing or stubbed — consumers must not assume full coverage |
| `"planned"` | Not yet implemented | No endpoints exist; declared for discovery purposes only |

Implementers should use `"partial"` when a backing service exists but does not yet cover all required endpoints for a capability, rather than declaring a capability `active` and returning `404` or `501` on some routes.

An OAP endpoint **selectively exposes** only the capabilities it supports. Consumers discover what's available by reading the manifest.

### Custom and Domain-Specific Capabilities

Implementers can expose capabilities beyond the `io.oap.*` set. Custom capabilities **must** use a reverse-domain prefix that the implementer controls — following the same convention as Java package names and Android intents:

| Convention | Example |
|---|---|
| OAP built-in | `io.oap.agents.registry` |
| Organisation-scoped | `io.dotquant.trading`, `com.acme.inventory` |
| Team-scoped | `com.acme.payments.refunds` |

The capability name must be unique. Implementers are responsible for ensuring their prefix does not conflict with others. The `io.oap.*` namespace is reserved for the OAP specification.

## Services Array — Discovery Hint vs. Live Registry

The optional `services` array in the manifest is a **snapshot at manifest-build time**, not the authoritative live list.

| | `services` in manifest | `GET /services` endpoint |
|---|---|---|
| **Purpose** | Quick discovery hint | Authoritative live list |
| **Freshness** | May be stale (built at deploy time) | Always current |
| **Required** | No | Yes, if `agents.registry` capability is declared |
| **Dynamic services** | May be absent or partial | Always complete |

For systems where services are created dynamically at runtime (e.g. per-account, per-tenant), the `services` array **should be omitted** or contain only representative examples. Consumers that need the real-time list must call `GET /services` on the REST endpoint.

## Transport Bindings

Each service declares how it can be reached:

```json
"rest": {
  "openapi": "https://openagentprotocol.io/v1/services/agents/openapi.json",
  "endpoint": "http://localhost:5100/"
},
"mcp": {
  "transport": "stdio",
  "server": "oap-mcp"
},
"a2a": {
  "agent_card_url": "http://localhost:5100/.well-known/agent.json"
}
```

| Transport | Primary consumer | Protocol |
|---|---|---|
| **REST** | Web UIs, traditional services, monitoring tools | HTTP/JSON |
| **MCP** | LLM clients (ChatGPT, Copilot, Gemini, Claude) | JSON-RPC over stdio/SSE |
| **A2A** | Other agents (Google Agent-to-Agent protocol) | HTTP/JSON |
| **gRPC** | Internal native runtime (optional) | Protocol Buffers |

### Multi-Tenant Routing

For multi-tenant SaaS implementations that serve multiple tenants under one host, the standard pattern is to include a `{tenantId}` segment in every tenant-scoped path:

```
GET  https://api.example.com/{tenantId}/agents
POST https://api.example.com/{tenantId}/events
```

`rest.endpoint` remains the root consumer-facing URL (e.g. `https://api.example.com/`). The `{tenantId}` segment is declared as a path parameter in `rest.openapi` on every tenant-scoped route. Authentication (typically a Bearer API key) identifies the caller; `{tenantId}` identifies which tenant's surface to target. Both are required on every request.

See [REST Transport](./transports/rest.md) for the full multi-tenant routing reference.

### `rest` Transport Fields

| Field | Description |
|---|---|
| `rest.openapi` | URL to the implementer's **OpenAPI spec** (JSON) describing the consumer-facing REST API surface. All paths in this spec are relative to `rest.endpoint`. This is a domain API contract — not a JSON Schema and not an OAP protocol schema. |
| `rest.endpoint` | **Consumer-facing base URL.** Must be publicly reachable by the consumer — never an internal backend address or private service-mesh URL. All REST API paths are appended to this value. |

The `rest.endpoint` value is the **consumer-facing base URL**. All REST API paths are appended to it. For example, if `rest.endpoint` is `https://app.agenthost.example/`, then the agents registry is at `https://app.agenthost.example/agents`.

> **`rest.endpoint` must be a publicly reachable consumer address** — never an internal backend or private service URL. If a backend service URL already exists in your codebase (e.g. a BaaS endpoint), it is not the right value for `rest.endpoint` unless it is also the consumer-facing address. If the implementation sits behind a proxy or API gateway, `rest.endpoint` is the outermost address consumers hit.

> **`rest.openapi` describes the consumer surface only.** All paths in the referenced OpenAPI spec are relative to `rest.endpoint` and must describe only the endpoints accessible at that public address. Internal or backend-private paths must not appear in the spec consumers read.

> **Multiple transports describe the same capability surface.** When both `rest` and `mcp` (or `a2a`) are declared, they each provide access to the same logical capabilities — they are alternative access methods, not separate operation sets. Consumers choose one transport; they do not infer separate capabilities from the presence of multiple transports.

## Schema

See [discovery.json](../protocol/v1/schemas/discovery.json) for the full JSON Schema.

## Full Example

See [well-known-oap.json](../protocol/v1/examples/well-known-oap.json) for a complete manifest example.
