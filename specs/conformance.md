# Conformance

## Minimal BEST Compliance

A BEST-compliant endpoint **must**:

1. Expose `GET /.well-known/best` returning a valid manifest
2. Include at least one service in the manifest
3. List all supported capabilities with valid schema URLs
4. Implement the HTTP API for every listed capability
5. Return valid JSON conforming to the referenced schemas
6. Use standard HTTP status codes and the BEST error response format — except `deviceAuthorizationUrl` and `tokenUrl`, which answer errors per RFC 6749 §5.2 ([Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration))
7. Declare authentication requirements in the manifest `authentication` block (or omit it for public endpoints); never silently reject requests with an undocumented 401
8. Reference every declared service from at least one capability — in the same manifest or, for a multi-tenant root, in its tenant manifests
9. Keep every manifest `description` within 500 characters and free of mechanics — no URLs or templates, header names or credential formats, operation names, or step-by-step instructions
10. Publish no second machine-readable or agent-directed description of the service (`llms.txt` restating operations, skill or prompt files, client snippets carrying behaviour, an OpenAPI document of the BEST endpoints)
11. Where `deviceAuthorizationUrl` is declared, carry the [sign-in guidance](https://github.com/behavioralstate/spec/blob/main/SPEC.md#sign-in-guidance) verbatim: the manifest text as that `authentication` block's `note`, the device text as the device answer's `note`, the token text at the start of the token answer's `note` — in the words of the version the manifest declares, or of a later one (a 0.9.14 service may carry 0.9.14's; a service that declares 0.9.15 carries 0.9.15's)

Items 8–10, the pseudo-tenant rule and accepting `application/cloudevents+json` on `POST /commands` are **required from 0.10.0**. 0.9.11 states them and validators report violations as warnings, so every implementer has one version of grace. Item 11 is required now. Normative text: [SPEC.md — Manifest Discipline](https://github.com/behavioralstate/spec/blob/main/SPEC.md#manifest-discipline).

## Capability-Level Compliance

For each capability an endpoint claims to support:

| Capability | Required Endpoints |
|---|---|
| `agents.commands` | GET /commands, POST /commands |
| `agents.events` | GET /events |
| `agents.queries` | GET /queries, GET /queries/{schema}/{version}, GET /queries/{schema} |
| `agents.workflows` | GET /workflows, GET /workflows/{id} |

> **Path resolution:** All paths above are relative to the `http.endpoint` base URL declared in the discovery manifest. For example, if `http.endpoint` is `https://app.example.com/BEST/`, then `GET /commands` resolves to `https://app.example.com/BEST/commands`. The paths are never relative to the domain root unless `http.endpoint` itself is the domain root.

### Partial Capabilities

A capability declared with `status: "partial"` is exempt from the full endpoint requirements above. Consumers **must not** assume that all required endpoints for a `partial` capability exist. Implementers **must** document which endpoints are available in the capability's `endpoints` array in the manifest.

A capability declared with `status: "active"` (or with no `status` field) **must** implement all required endpoints in the table above. Declaring a capability `active` while returning `404` or `501` on required routes is a conformance violation.

## Root Manifest Rules (Multi-Tenant Hosts)

When a host serves multiple tenants and uses the `tenants.manifest` pattern, the root manifest (at `/.well-known/best`) has additional conformance requirements:

1. The root manifest **MUST** include a `tenants.manifest` URI template if tenant-scoped capabilities exist.
2. The root manifest **MUST NOT** declare tenant-scoped capabilities (e.g. `io.best.agents.commands`, `io.best.agents.events`) — these belong only in tenant manifests.
3. The root manifest **MAY** declare root-level capabilities it can fulfill directly without a tenant context (e.g. a tenant listing endpoint).
4. The root manifest **MUST** return `200` without authentication. Auth is not required to discover that a tenant ID is needed.
5. The tenant manifest (returned at the expanded `tenants.manifest` URI) **MUST** be a self-contained, fully-resolved manifest with no `{tenantId}` placeholders in any URI field and no `tenants` block of its own.
6. Tenant manifest endpoints (`/.well-known/best/{tenantId}`) **MUST NOT** require a tenant ID header or query parameter — the tenant ID is already in the URL path. At most, the API key credential declared in the root `authentication` block is required.

**Why this matters for agents:** An AI agent hitting a root manifest that has an empty `capabilities` array but no `tenants.manifest` cannot proceed — it has no signal for what to do next. A root manifest that follows these rules gives any agent unambiguous guidance: check capabilities → if absent, check tenants.manifest → ask user for tenant ID → fetch tenant manifest.



All BEST HTTP endpoints must use standard HTTP status codes. The following are required:

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (command accepted and durably queued) |
| 202 | Accepted (async processing without durability guarantee) |
| 400 | Invalid request body (schema validation failure) |
| 401 | Authentication required or credentials invalid (only when `authentication.type` is not `none`) |
| 404 | Resource not found |
| 409 | Conflict (duplicate command `id` with different payload) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

A `401` response **must** be returned when a request lacks valid credentials and the endpoint declares a non-`none` authentication type. The `/.well-known/best` endpoint is exempt and must always return `200` without requiring credentials.

## What Compliance Does NOT Require

- A specific programming language or framework
- A specific internal architecture
- A specific event transport (Kafka, RabbitMQ, etc.)
- MCP support (HTTP is the baseline)
- AI/LLM capabilities (agents can be purely deterministic, human-operated, or anything else)
