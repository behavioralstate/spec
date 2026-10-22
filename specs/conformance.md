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
11. Where `deviceAuthorizationUrl` is declared, carry the [sign-in guidance](https://github.com/behavioralstate/spec/blob/main/SPEC.md#sign-in-guidance) verbatim: the manifest text as that `authentication` block's `note`, the device text as the device answer's `note`, the token text at the start of the token answer's `note` — in the words of the version the manifest declares, or of a later one (a 0.9.14 service may carry 0.9.14's; a service that declares 0.9.17 carries 0.9.17's); accept `connection` in the device request and give it back as the token answer's `name`, keying the `mcp` entry by it ([SPEC.md — Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration))
12. Bind a correlation id to the sender that first used it, refusing another sender's command naming it with a `400` that names the field ([SPEC.md — Command Results and Correlation](https://github.com/behavioralstate/spec/blob/main/SPEC.md#command-results-and-correlation))
13. Meet each obligation the specification marks *(Required from 0.10.0)*: the tenants of a credential answered with no `tenant_id` listed at the root (Root Manifest Rule 8 below), and the end of a credential ([SPEC.md — Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration)); the correlation id on every later fact about what a command created ([Command Results and Correlation](https://github.com/behavioralstate/spec/blob/main/SPEC.md#command-results-and-correlation)); a workflows capability `active` only with a recipe ([Workflows](https://github.com/behavioralstate/spec/blob/main/SPEC.md#workflows--iobestagentsworkflows)); a query's `parameters` schema enforced and an `/events` range in RFC 3339 ([Queries](https://github.com/behavioralstate/spec/blob/main/SPEC.md#queries--iobestagentsqueries), [Events](https://github.com/behavioralstate/spec/blob/main/SPEC.md#events--iobestagentsevents)); and, in [security.md](https://github.com/behavioralstate/spec/blob/main/specs/security.md), cleartext refused and never carrying a credential, request records without credentials or query strings, and the `413` and `429` answers

Items 8–10, 12 and 13, the pseudo-tenant rule ([SPEC.md — Multi-Tenancy](https://github.com/behavioralstate/spec/blob/main/SPEC.md#multi-tenancy) rule 5) and accepting `application/cloudevents+json` on `POST /commands` are **required from 0.10.0**. Each is stated from the release that introduced it (items 8–10 from 0.9.11), and validators report its violations as warnings until 0.10.0, so that every implementer has at least one version of grace. Item 11 is required now. Normative text: [SPEC.md — Manifest Discipline](https://github.com/behavioralstate/spec/blob/main/SPEC.md#manifest-discipline).

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

A capability declared with `status: "active"` (or with no `status` field) **must** implement all required endpoints in the table above. Declaring a capability `active` while returning `404` or `501` on required routes is a conformance violation. A workflows capability is `active` only while it publishes at least one recipe, and `planned`, serving no index, with none (item 13).

## Root Manifest Rules (Multi-Tenant Hosts)

When a host serves multiple tenants and uses the `tenants.manifest` pattern, the root manifest (at `/.well-known/best`) has additional conformance requirements:

1. The root manifest **MUST** include a `tenants.manifest` URI template if tenant-scoped capabilities exist.
2. The root manifest **MUST NOT** declare tenant-scoped capabilities (e.g. a tenant's own `io.best.agents.commands` or `io.best.agents.events`) — these belong only in tenant manifests. A root that is itself a surface keeps capabilities of its own, under item 3.
3. The root manifest **MAY** declare root-level capabilities it can fulfill directly without a tenant context (e.g. a tenant listing endpoint). Such a capability's service declares an `authentication` block of its own, even one identical to the root's, which is how a consumer and a validator tell it from a tenant-scoped capability left at the root.
4. The root manifest **MUST** return `200` without authentication. Auth is not required to discover that a tenant ID is needed.
5. The tenant manifest (returned at the expanded `tenants.manifest` URI) **MUST** be a self-contained, fully-resolved manifest with no `{tenantId}` placeholders in any URI field and no `tenants` block of its own.
6. Tenant manifest endpoints (`/.well-known/best/{tenantId}`) **MUST NOT** require a tenant ID header or query parameter — the tenant ID is already in the URL path. At most, the API key credential declared in the root `authentication` block is required.
7. Where a service announced at the root for its tenants has, in the root manifest, the `http.endpoint` its tenant manifests' endpoints extend with `/{tenantId}` — its tenants root — a `GET` on that URL **SHOULD** answer, with a credential, `200` and the tenants it opens (`tenant_id`, `endpoint`, `manifest`), and **MUST** for a credential answered with no `tenant_id` (item 8); without one, the `401` a tenant endpoint gives; where the service cannot tell, a BEST error saying where the consumer finds its tenant, never for a credential answered with no `tenant_id`, whose tenants item 8 lists. Never a bare `404` ([SPEC.md — Multi-Tenancy](https://github.com/behavioralstate/spec/blob/main/SPEC.md#multi-tenancy) rule 6).
8. A host whose token answer names no `tenant_id` for a credential admitted at its root — one identity may hold several tenants, or none yet — **MUST** list, at the root, the tenants that credential opens, each with its `tenant_id`, `endpoint` and `manifest`: by a tenants root (item 7), which such a host declares, or, where the root is itself a surface, by a query of the root's own catalogue. `tenant_id` is never the host or another stand-in. *(Required from 0.10.0.)* Normative text: [SPEC.md — Agent Registration](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-registration).

**Why this matters for agents:** An AI agent hitting a root manifest that has an empty `capabilities` array but no `tenants.manifest` cannot proceed — it has no signal for what to do next. A root manifest that follows these rules gives any agent unambiguous guidance: check capabilities → if absent, check tenants.manifest → ask user for tenant ID → fetch tenant manifest.



All BEST HTTP endpoints must use standard HTTP status codes. The following are required:

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (command accepted and durably queued) |
| 202 | Accepted (async processing without durability guarantee) |
| 400 | Invalid request (schema validation failure, or a well-formed command the service cannot honour in its current state) |
| 401 | Authentication required or credentials invalid (only when `authentication.type` is not `none`) |
| 404 | Resource not found |
| 409 | Conflict (duplicate command `id`: with a different payload always, with the same payload when the service rejects a duplicate rather than ignoring it) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

A `401` response **must** be returned when a request lacks valid credentials and the endpoint declares a non-`none` authentication type. The `/.well-known/best` endpoint is exempt and must always return `200` without requiring credentials.

## What Compliance Does NOT Require

- A specific programming language or framework
- A specific internal architecture
- A specific event transport (Kafka, RabbitMQ, etc.)
- MCP support (HTTP is the baseline)
- AI/LLM capabilities (agents can be purely deterministic, human-operated, or anything else)
