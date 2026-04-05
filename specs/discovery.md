# Discovery — `/.well-known/oap`

**Version:** 2025-07-01

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
3. Discovers available agents, services, capabilities, transport bindings, and authentication requirements
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
    "agents": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | OAP spec version (date-based: `"YYYY-MM-DD"`) |
| `authentication` | object | no | Authentication requirements for this endpoint (omit for public endpoints) |
| `services` | object | yes | Service definitions with transport bindings |
| `capabilities` | array | yes | Supported capabilities with schema URLs |
| `agents` | array | no | Snapshot of known agents (discovery hint only — see below) |

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
| Agents | `io.oap.agents` | Agent management, event delivery, command observation |
| Observability | `io.oap.observability` | Execution traces and audit trail |

## Capabilities

Capabilities are composable building blocks within a service.

| Capability | Description | Extends |
|---|---|---|
| `io.oap.agents.registry` | Register, remove, list, get agents | — |
| `io.oap.agents.lifecycle` | Pause and resume agents | `agents.registry` |
| `io.oap.agents.events` | Send events, list recent events | — |
| `io.oap.agents.commands` | List produced commands | — |
| `io.oap.agents.memory` | View agent memory state | `agents.registry` |
| `io.oap.observability.tracing` | Execution traces | — |

An OAP endpoint **selectively exposes** only the capabilities it supports. Consumers discover what's available by reading the manifest.

### Custom and Domain-Specific Capabilities

Implementers can expose capabilities beyond the `io.oap.*` set. Custom capabilities **must** use a reverse-domain prefix that the implementer controls — following the same convention as Java package names and Android intents:

| Convention | Example |
|---|---|
| OAP built-in | `io.oap.agents.registry` |
| Organisation-scoped | `io.dotquant.trading`, `com.acme.inventory` |
| Team-scoped | `com.acme.payments.refunds` |

The capability name must be unique. Implementers are responsible for ensuring their prefix does not conflict with others. The `io.oap.*` namespace is reserved for the OAP specification.

## Agents Array — Discovery Hint vs. Live Registry

The optional `agents` array in the manifest is a **snapshot at manifest-build time**, not the authoritative live list.

| | `agents` in manifest | `GET /agents` endpoint |
|---|---|---|
| **Purpose** | Quick discovery hint | Authoritative live list |
| **Freshness** | May be stale (built at deploy time) | Always current |
| **Required** | No | Yes, if `agents.registry` capability is declared |
| **Dynamic agents** | May be absent or partial | Always complete |

For systems where agents are created dynamically at runtime (e.g. per-account brokers, per-tenant workers), the `agents` array **should be omitted** or contain only representative examples. Consumers that need the real-time list must call `GET /agents` on the REST endpoint.

## Transport Bindings

Each service declares how it can be reached:

```json
"rest": {
  "schema": "https://openagentprotocol.io/v1/services/agents/openapi.json",
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

The `rest.endpoint` value is the **base URL**. All REST API paths are appended to it. For example, if `rest.endpoint` is `https://app.dotquant.io/`, then the agents registry is at `https://app.dotquant.io/agents`.

## Schema

See [discovery.json](../protocol/v1/schemas/discovery.json) for the full JSON Schema.

## Full Example

See [well-known-oap.json](../protocol/v1/examples/well-known-oap.json) for a complete manifest example.
