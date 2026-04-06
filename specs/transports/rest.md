# REST Transport

**Version:** 2025-07-01

REST is the primary transport for web-based consumers including the OAP web UI. The full REST API is defined by the OpenAPI schemas referenced in each service's `rest.schema` URL.

## Content Type

All requests and responses use `application/json`.

## Base URL and Path Resolution

The `rest.endpoint` field in the discovery manifest is the **base URL** for all REST operations. All paths in the OpenAPI spec are appended to this base URL. For example:

| `rest.endpoint` | Path | Resolved URL |
|---|---|---|
| `https://app.example.com/` | `/agents` | `https://app.example.com/agents` |
| `https://app.agenthost.example/oap/` | `/agents` | `https://app.agenthost.example/oap/agents` |
| `http://localhost:5100` | `/agents` | `http://localhost:5100/agents` |

Paths are **never** resolved relative to the domain root unless `rest.endpoint` is at the domain root.

## Authentication

When the discovery manifest declares an `authentication` block, consumers must include credentials on all REST requests (except `GET /.well-known/oap`):

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
| 409 | Conflict (agent already registered) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

## OpenAPI Specs

- [Agent Service OpenAPI](../../protocol/v1/services/agents/openapi.json)
- [Observability Service OpenAPI](../../protocol/v1/services/observability/openapi.json)
