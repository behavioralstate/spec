# HTTP Transport

HTTP is the primary transport for web-based consumers including the OAP web UI. The HTTP API surface is fully described by the capability `endpoints` arrays in the discovery manifest — no separate OpenAPI document is required from implementers.

## Content Type

All requests and responses use `application/json`.

## Base URL and Path Resolution

The `http.endpoint` field in the discovery manifest is the **consumer-facing base URL** for all HTTP operations. All paths in the OpenAPI spec are appended to this base URL. For example:

| `http.endpoint` | Path | Resolved URL |
|---|---|---|
| `https://app.example.com/` | `/services` | `https://app.example.com/services` |
| `https://app.agenthost.example/oap/` | `/services` | `https://app.agenthost.example/oap/services` |
| `https://your.compliant.oap.endpoint` | `/services` | `https://your.compliant.oap.endpoint/services` |

Paths are **never** resolved relative to the domain root unless `http.endpoint` is at the domain root.

> **`http.endpoint` is always the consumer-facing URL.** It must be the public or proxy address reachable by external consumers, not an internal backend address. If the implementer routes traffic internally, `http.endpoint` is the _outermost_ address consumers hit.

## Multiple Transports, One Capability Surface

A service may declare multiple transport bindings (`http`, `mcp`, `a2a`) for the same capability surface. All transports expose the same logical operations — the transports are alternative access methods, not separate operation sets.

```json
"http": { "endpoint": "https://api.example.com/" },
"mcp": { "transport": "stdio", "server": "oap-mcp" }
```

Both HTTP and MCP above provide access to the same services registry, event delivery, and command ingestion. Consumers choose the transport that fits their platform; they do not infer separate capabilities from the transport list.

## Multi-Tenant Routing

Many production OAP endpoints are multi-tenant — they serve multiple tenants under one host. The standard pattern is to include a `{tenantId}` segment in the path:

```
GET  https://api.example.com/{tenantId}/events
GET  https://api.example.com/{tenantId}/agents
```

When this pattern is used:

- `http.endpoint` is still the root consumer-facing URL (e.g. `https://api.example.com/`).
- The `{tenantId}` path segment is declared in capability `endpoints` entries on every tenant-scoped route.
- Authentication (typically a Bearer API key) identifies the caller; `{tenantId}` identifies _which_ tenant's surface to target. Both are required on every request.

For machine-actionable tenant discovery (letting consumers resolve a tenant manifest without prior knowledge of the URL structure), see [`tenants.manifest` in the Discovery spec](../discovery.md#tenantsmanifest-uri-template-for-tenant-discovery).

## Authentication

When the discovery manifest declares an `authentication` block, consumers must include credentials on all HTTP requests (except `GET /.well-known/oap`):

| Type | How to send |
|---|---|
| `bearer` | `Authorization: Bearer <token>` header |
| `apiKey` (header) | Custom header named in `authentication.scheme` |
| `apiKey` (query) | Query parameter named in `authentication.scheme` |
| `none` | No credentials required |

The security schemes are formally declared in the OpenAPI `securitySchemes` component. Consumers should read the discovery manifest's `authentication.tokenUrl` to obtain tokens programmatically.

## Error Responses

All endpoints use standard HTTP status codes with a consistent error body:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 'negotiation' is not registered",
    "details": {}
  }
}
```

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (agent registration) |
| 202 | Accepted (async processing, e.g. event delivery) |
| 204 | Success with no body (pause, resume, delete) |
| 400 | Invalid request body (schema validation failure) |
| 401 | Authentication required or credentials invalid |
| 404 | Resource not found (agent, trace) |
| 409 | Conflict (e.g. duplicate subscription) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

## OpenAPI Specs

- [Agent Service OpenAPI](../../protocol/v1/services/agents/openapi.json)
