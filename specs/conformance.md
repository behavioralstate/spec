# Conformance

**Version:** 2026-04-10

## Minimal OAP Compliance

A OAP-compliant endpoint **must**:

1. Expose `GET /.well-known/oap` returning a valid manifest
2. Include at least one service in the manifest
3. List all supported capabilities with valid schema URLs
4. Implement the REST API for every listed capability
5. Return valid JSON conforming to the referenced schemas
6. Use standard HTTP status codes and the OAP error response format
7. Declare authentication requirements in the manifest `authentication` block (or omit it for public endpoints); never silently reject requests with an undocumented 401

## Capability-Level Compliance

For each capability an endpoint claims to support:

| Capability | Required Endpoints |
|---|---|
| `agents.registry` | GET/POST /services, GET/DELETE /services/{id} |
| `agents.lifecycle` | POST /services/{id}/pause, POST /services/{id}/resume |
| `agents.events` | GET /events |
| `agents.commands` | GET /commands, POST /commands |
| `agents.memory` | GET /services/{id}/memory |
| `observability.tracing` | GET /traces, GET /traces/{traceId} |

> **Path resolution:** All paths above are relative to the `rest.endpoint` base URL declared in the discovery manifest. For example, if `rest.endpoint` is `https://app.example.com/oap/`, then `GET /services` resolves to `https://app.example.com/oap/services`. The paths are never relative to the domain root unless `rest.endpoint` itself is the domain root.

### Partial Capabilities

A capability declared with `status: "partial"` is exempt from the full endpoint requirements above. Consumers **must not** assume that all required endpoints for a `partial` capability exist. Implementers **must** document which endpoints are available in the `rest.openapi` spec.

A capability declared with `status: "active"` (or with no `status` field) **must** implement all required endpoints in the table above. Declaring a capability `active` while returning `404` or `501` on required routes is a conformance violation.

## Required HTTP Status Codes

All OAP REST endpoints must use standard HTTP status codes. The following are required:

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (agent registration) |
| 202 | Accepted (async processing, e.g. event delivery) |
| 204 | Success with no body (pause, resume, delete) |
| 400 | Invalid request body (schema validation failure) |
| 401 | Authentication required or credentials invalid (only when `authentication.type` is not `none`) |
| 404 | Resource not found (agent, trace) |
| 409 | Conflict (agent already registered) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

A `401` response **must** be returned when a request lacks valid credentials and the endpoint declares a non-`none` authentication type. The `/.well-known/oap` endpoint is exempt and must always return `200` without requiring credentials.

## What Compliance Does NOT Require

- A specific programming language or framework
- A specific internal architecture
- A specific event transport (Kafka, RabbitMQ, etc.)
- MCP or A2A support (REST is the baseline)
- AI/LLM capabilities (agents can be purely deterministic, human-operated, or anything else)
