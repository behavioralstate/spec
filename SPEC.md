# BEST — Behavioral State Protocol

**Consolidated specification.** This document is the single-file reference for the whole protocol: design, discovery, commands, events, queries, transports, conformance, and security. The machine-readable source of truth lives in [`protocol/v1/`](protocol/v1/) (JSON Schemas and examples); where prose and schema disagree, the schema wins.

> Version strings in examples use the `{{BEST_VERSION}}` placeholder, stamped from [`version.json`](version.json) at release time.

## Contents

- [What BEST Is](#what-best-is)
- [Design Principles](#design-principles)
- [Core Primitives and Capability Tiers](#core-primitives-and-capability-tiers)
- [Wire Format — the BEST Envelope](#wire-format--the-best-envelope)
- [Discovery — `/.well-known/best`](#discovery--well-knownbest)
- [Multi-Tenancy](#multi-tenancy)
- [Commands — `io.best.agents.commands`](#commands--iobestagentscommands)
- [Events — `io.best.agents.events`](#events--iobestagentsevents)
- [Queries — `io.best.agents.queries`](#queries--iobestagentsqueries)
- [Workflows — `io.best.agents.workflows`](#workflows--iobestagentsworkflows)
- [Composing Multi-Step Processes](#composing-multi-step-processes)
- [HTTP Transport](#http-transport)
- [MCP Transport](#mcp-transport)
- [Agent Navigation Guide](#agent-navigation-guide)
- [Conformance](#conformance)
- [Versioning](#versioning)
- [Security Requirements](#security-requirements)

---

## What BEST Is

BEST standardises **capability discovery and behavioural interoperability** for distributed and agentic systems, on CQRS semantics. The problem it addresses arrives when an organisation runs multiple agents against heterogeneous systems: how do those agents discover capabilities, express intent, observe the resulting events, and correlate outcomes — consistently and machine-understandably — without every integration becoming bespoke? BEST answers with one interaction surface that any caller — an AI agent, a Process Manager, a UI, another service — can consume across any runtime, platform, or language.

BEST does not care how a service works internally. It defines only the interaction surface:

- **what commands go in** — named intents to change the system
- **what queries read** — synchronous views of current state
- **what events come out** — immutable facts recording what happened, carrying the `correlationid` that ties outcomes back to the intent that caused them
- **how to discover the service** — a `/.well-known/best` manifest

Anyone with something to offer — a business, a service, a sensor, an AI agent — can expose a BEST manifest and become discoverable and callable by any agent, with no bespoke integration.

| Example implementer | Accepts (commands) | Produces (events) |
|---|---|---|
| Contract negotiation service | `ProposeCounter`, `AcceptContract` | `CounterProposed`, `ContractAccepted` |
| IoT temperature sensor | `ReadTemperature` | `TemperatureRead`, `TemperatureAlarm` |
| Code review service | `ReviewPullRequest` | `ReviewCompleted`, `ChangesRequested` |
| Approval workflow | `RequestApproval` | `ApprovalGranted`, `ApprovalDenied` |

> **BEST is not REST.** There are no resources to manipulate and no CRUD verbs. There are named operations to invoke — commands — and facts to observe — events. `POST /commands` is a behaviour entry point routed by the message `type`, not a resource collection. Standard REST endpoints (`GET /orders/{id}`) belong in a service's own API, outside BEST scope.

## Design Principles

1. **Protocol-first** — the spec defines the surface; implementations derive from it.
2. **Compose, don't invent** — built on existing standards: JSON Schema, the CloudEvents envelope shape, MCP, SSE, RFC 6570 URI templates.
3. **Discoverable by default** — every endpoint self-describes via `/.well-known/best`; consumers need zero prior configuration.
4. **Transport-agnostic** — the same semantics over HTTP (baseline) or MCP (LLM tooling).
5. **Modular capabilities** — implementers expose only what they support; consumers discover what's available at runtime.
6. **LLM-readable** — JSON Schema is the canonical contract format because LLMs read, generate, and reason about JSON natively.
7. **Implementation-agnostic** — no prescribed language, framework, event store, or architecture.

## Core Primitives and Capability Tiers

| Primitive | Description |
|---|---|
| **Service** | A BEST-compliant domain service that accepts commands and publishes events |
| **Command** | An intent to change the system, sent to a service by any caller |
| **Event** | An immutable domain fact published by a service as the result of processing |
| **Query** | A synchronous read of current state (optional capability) |

| Tier | Capabilities | Meaning |
|---|---|---|
| **Core** | `/.well-known/best` discovery · `io.best.agents.commands` · `io.best.agents.events` | Required. A service implementing only these three is fully BEST-compliant. |
| **Extended** | `io.best.agents.queries` · `io.best.agents.workflows` | Optional. Declared in the manifest; consumers discover them at runtime. |
| **Out of scope** | Execution runtimes, workflow execution, durable execution, retries, checkpointing, memory contracts, domain models, identity providers | Never owned by BEST. These belong to the service's internals or a separate execution layer. |

> **The core is intentionally small.** A minimal BEST endpoint is three things: a discovery manifest, a command entry point, and an event log. Everything else is additive.

## Wire Format — the BEST Envelope

Commands and events share one wire format: the **CloudEvents 1.0 envelope**, of which BEST is a conformant profile. Canonical schema: [`cloudEvent.json`](protocol/v1/schemas/cloudEvent.json).

| Field | Type | Commands | Events | Description |
|---|---|---|---|---|
| `specversion` | string | required | required | Always `"1.0"` |
| `id` | string | required | required | Unique message ID (UUID recommended). For commands this is the **idempotency key**. |
| `correlationid` | string | optional | conditional | **Correlation identifier** — a CloudEvents extension attribute (lowercase on the wire). Commands: optional; when omitted the server adopts the command's `id`. Events: **required** on every event produced by processing a command, carrying that command's correlation identifier; spontaneous events may omit it. Follow-up commands in the same business process **should** propagate the same value. |
| `source` | string (URI-reference) | required | required | Origin of the message — a URI-reference per RFC 3986. Absolute URI recommended; a relative reference (a service name or routing key) is valid. Caller-declared; never authenticated identity. |
| `type` | string | required | required | Message type in **PascalCase** (`ProposeCounter`, `CounterProposed`). For commands, must match a type in the command catalogue — this is the routing key. |
| `datacontenttype` | string | required | required | Always `"application/json"` |
| `dataschema` | string (URI) | required | optional | Absolute URI of the JSON Schema for `data` — for commands, the catalogue's `dataschema` value (e.g. `https://api.example.com/commands/propose-counter/1.0`). Events without `dataschema` are *untyped* — the consumer interprets `data`. |
| `time` | string | required | required | ISO 8601 timestamp of creation |
| `data` | object | required | required | The domain payload. For commands, validated against the catalogue schema before queuing. For events, semantically opaque to the protocol. |

**Example command** and **example event**:

```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/commands/propose-counter/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": { "salary": 100000, "startDate": "2025-09-01" }
}
```

```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/events/counter-proposed/1.0",
  "correlationid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "time": "2025-07-01T10:30:01Z",
  "data": { "salary": 100000, "startDate": "2025-09-01", "contractId": "contract-42" }
}
```

### A Conformant CloudEvents Profile

**Every valid BEST message is a valid CloudEvents 1.0 message.** BEST is a *profile* of CloudEvents: it restricts the envelope without violating it, so CloudEvents SDKs, brokers, and validators work with BEST traffic unchanged.

| Rule | CloudEvents 1.0 | BEST profile restriction |
|---|---|---|
| `type` casing | Unspecified | PascalCase mandated |
| `datacontenttype` | Any media type | `"application/json"` only |
| `dataschema` presence | Optional | Required for commands (optional for events) |
| `source` | URI-reference, absolute recommended | Same — BEST adds that it must never be treated as authenticated identity |
| Extension attributes | Producers may add them | Permitted; BEST defines one (`correlationid`) and consumers **must** ignore unknown attributes rather than reject |

## Discovery — `/.well-known/best`

Every BEST endpoint exposes:

```
GET /.well-known/best
Content-Type: application/json
```

This endpoint is **always public** — an implementation that requires auth on it is non-conformant. The path is canonical; `/.well-known/best.json` may be served as an optional alias, but consumers must not rely on it.

Schema: [`discovery.json`](protocol/v1/schemas/discovery.json) · Full example: [`well-known-best.json`](protocol/v1/examples/well-known-best.json)

### Manifest Root

| Field | Required | Description |
|---|---|---|
| `best.version` | yes | BEST spec version (semver) |
| `best.services` | yes | Service definitions with transport bindings, keyed by reverse-domain name |
| `best.capabilities` | yes | Supported capabilities with spec/schema URLs |
| `best.authentication` | no | Credential requirements for all non-discovery endpoints (omit for public endpoints) |
| `best.tenants` | no | Multi-tenant manifest discovery — see [Multi-Tenancy](#multi-tenancy) |
| `best.agents` | no | Snapshot of hosted [service descriptors](#service-descriptor) — a discovery hint, not a live directory |
| `best.extensions` | no | Vendor-defined static declarations — see [Extensions](#extensions) |

### Authentication Block

```json
"authentication": {
  "type": "apiKey",
  "scheme": "X-Api-Key",
  "in": "header",
  "docs": "https://docs.example.com/authentication"
}
```

| Field | Required | Description |
|---|---|---|
| `type` | yes | `"none"` · `"bearer"` · `"apiKey"` · `"oauth2"` |
| `scheme` | no | For `bearer`: the Authorization prefix (`"Bearer"`). For `apiKey`: the header or query parameter name. |
| `in` | no | `"header"` or `"query"` (for `apiKey`) |
| `scopes` | no | Required OAuth2/token scopes |
| `tokenUrl` | no | Token endpoint for OAuth2/token flows |
| `docs` | no | Human-readable onboarding documentation URL |

Consumers **must** read this block before calling anything else. Hosts requiring credentials **should** set `docs` to a page explaining how to obtain them — for multi-tenant hosts, that page should cover acquiring both the API key and the tenant ID, since neither is derivable from the manifest.

### Services and Transport Bindings

Each entry in `services` declares `version` and `description` (required), optional `spec` URL, and one or more transport bindings:

| Binding | Required fields | Notes |
|---|---|---|
| `http` | `endpoint` | **Baseline — every conformant service exposes it.** `endpoint` is the consumer-facing base URL; all capability paths are appended to it. |
| `mcp` | `transport` (`stdio`/`sse`/`http`), `server` | Optional. May carry its own `authentication` block and `push: true`. See [MCP Transport](#mcp-transport). |

Multiple transports expose the **same capability surface** — they are alternative access methods, never separate operation sets.

### Capability Entries

| Field | Required | Description |
|---|---|---|
| `name` | yes | Reverse-domain capability name. `io.best.*` is reserved for the spec; custom capabilities use an implementer-owned prefix (`com.acme.inventory`). |
| `version` | yes | Semver |
| `description` | yes | Human-readable summary |
| `spec` | io.best.* only | URL to the capability specification page (optional for custom capabilities) |
| `schema` | io.best.* only | URL to the capability's **JSON Schema** (not OpenAPI) |
| `service` | conditional | Key of the implementing service in `services`. Required when the capability's name prefix doesn't match the service key (e.g. custom service `io.dotquant.trading` implementing `io.best.agents.commands`). |
| `status` | no | `"active"` (default) · `"partial"` · `"planned"` |
| `endpoints` | no | Machine-readable list of `{ method, path, description? }`. Paths are appended to the service's `http.endpoint`. This is how consumers self-bootstrap without reading spec pages. |
| `push` | no | Push channels supported (events capability): `{ "sse": true, "mcp": true }` |
| `extends` | no | Parent capability, if any |
| `extensions` | no | Vendor-defined static declarations — see [Extensions](#extensions) |

**Status semantics:** `active` means all required endpoints exist and are callable — declaring `active` while returning `404`/`501` on required routes is a conformance violation. `partial` means a subset is implemented; consumers must not assume full coverage and should consult the `endpoints` array. `planned` means nothing is callable yet.

**Command types are domain data, not capabilities.** Individual command types (`ProposeCounter`) must never appear as manifest capability entries — the capability declares the command *surface*; the specific types are discovered at runtime via `GET /commands`.

### Extensions

The manifest root and each capability entry accept one optional free-form object, **`extensions`**, for vendor-defined declarations. Everything else in the manifest stays strictly closed (`additionalProperties: false`) — this is the single lawful home for data the spec doesn't define:

```json
{
  "name": "io.best.agents.events",
  "version": "1.0",
  "spec": "…", "schema": "…",
  "extensions": {
    "com.acme.region": "eu-west-1",
    "org.example.attestation": { "format": "…", "value": "…" }
  }
}
```

Rules:

- **Domain-first.** Anything dynamic, behavioral, or obtainable after authentication **must** be modeled as ordinary capability surface — a custom capability, a query, an event, a workflow — never as an extension. `extensions` exists solely for **static, discovery-time declarations that must ride in the manifest document itself**: facts a consumer needs *before* deciding to interact (an unauthenticated indexer classifying hosts, integrity data covering the manifest), or facts that annotate a specific manifest element in place.
- Keys **should** be reverse-domain identifiers owned by the declarer (`com.acme.region`); `io.best.*` remains reserved for the specification.
- The core protocol never interprets the contents; validators check only that `extensions` is an object. Consumers **must** ignore extensions they don't understand.
- An extension **must never** be required in order to use a core capability — a manifest whose core surface only works when a consumer reads an extension is non-conformant.
- The manifest-hygiene rule applies unchanged: the root manifest is public, so extension content there is limited to information intended for unauthenticated disclosure.

### Service Descriptor

The optional `agents` array carries service descriptors — the identity card of each hosted service. Example: [`service-descriptor.json`](protocol/v1/examples/service-descriptor.json).

| Field | Required | Description |
|---|---|---|
| `id`, `name` | yes | Unique identifier and display name |
| `accepts`, `produces` | yes | PascalCase CloudEvent `type` strings the service ingests/publishes |
| `status` | yes | `running` · `paused` · `stopped` · `error` |
| `description`, `type`, `version`, `endpoint` | no | Metadata; `endpoint` is the service's own BEST base URL if directly addressable |
| `metadata` | no | Opaque service-defined configuration (e.g. model name, system prompt). The protocol never interprets it. |

BEST defines **no registry endpoint**. Implementations that manage services dynamically expose that as an ordinary domain — e.g. a `RegisterService` command and a `list-services` query — under their own namespace.

## Multi-Tenancy

A tenant ID in BEST is an opaque string scoping a manifest to a context — a customer account, a user, a workspace, or the platform's own administrative context. Use it when callers operate in isolated data scopes (even with identical capabilities), skip it for single-tenant deployments.

The root manifest of a multi-tenant host declares a **URI template** (RFC 6570, `{tenantId}` is the only permitted variable):

```json
"tenants": {
  "manifest": "https://api.example.com/.well-known/best/{tenantId}"
}
```

Rules (normative — see also [Conformance](#conformance)):

1. The root manifest **must** include `tenants.manifest` if tenant-scoped capabilities exist, and **must not** declare tenant-scoped capabilities itself — they appear only in tenant manifests. Root-level capabilities the host can fulfil without tenant context may stay.
2. The expanded URI returns a **fully self-contained** tenant manifest: its `http.endpoint` is pre-scoped (e.g. `https://api.example.com/api/best/tenants/acme`), every `dataschema` URI fully resolved, no `{tenantId}` placeholders anywhere, no `tenants` block of its own.
3. Fetching `/.well-known/best/{tenantId}` requires at most the API key declared in the root `authentication` block — never a tenant ID header (the path already carries it).
4. URI templating is valid **only** in `tenants.manifest`. Everywhere else, URIs are fully resolved.

## Commands — `io.best.agents.commands`

Commands are intents to change a domain service. The service validates, queues, and processes them **asynchronously**; results surface as events.

Schema: [`commands.json`](protocol/v1/schemas/agents/commands.json)

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | Command catalogue — all accepted command types with schema URIs |
| POST | `/commands` | Send a command (BEST envelope). Validates, queues, returns `201`. |
| GET | `/commands/{schema}/{version}` | JSON Schema document for one command type/version (`application/schema+json`) |

### Command Catalogue

```json
{
  "commands": [
    {
      "schema": "propose-counter",
      "version": "1.0",
      "dataschema": "https://api.example.com/commands/propose-counter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `schema` | yes | Command schema name in **kebab-case** — the `{schema}` path segment. Distinct from the envelope `type` (typically its PascalCase form). |
| `version` | yes | Schema version (`1.0`, `2.1`) — first-class, no URI parsing needed |
| `dataschema` | yes | Resolvable URI to the JSON Schema for `data` — the canonical value for a command's `dataschema` field. Resolves to `GET /commands/{schema}/{version}` on this same surface. |
| `description` | no | What the command does |
| `workflows` | no | Ids of [published workflows](#workflows--iobestagentsworkflows) this command participates in — servers **should** populate it for every operation that appears in a recipe |
| `impact` | no | [High-impact annotation](#impact-annotations) — declares that the command is high-impact and that a human-facing consumer must warn and confirm before submitting |

### Impact Annotations

Some commands do not share a blast radius with the rest of the catalogue: they move money, destroy data, or cannot be undone. The [Security Requirements](#security-requirements) already oblige servers to place extra controls on such commands — but until a client can *discover* which commands those are, only the server side of the obligation is implementable. The optional **`impact`** annotation closes that gap:

```json
{
  "schema": "submit-order",
  "version": "1.0",
  "dataschema": "https://api.example.com/commands/submit-order/1.0",
  "description": "Submit a market order to the caller's broker connection",
  "impact": {
    "categories": ["financial"],
    "confirmation": "required",
    "warning": "Places a real order on your broker account. Capital is at risk."
  }
}
```

| Field | Required | Description |
|---|---|---|
| `categories` | yes | What kind of impact — named values: `financial` (moves money or puts capital at risk), `destructive` (removes data or state), `irreversible` (no compensating command), `compliance` (bypasses or alters a compliance control). The vocabulary is open; consumers treat unknown values as high-impact. |
| `confirmation` | yes | `required`: a consumer acting on behalf of a human **must not** submit the command without explicit, per-submission confirmation from that human. `recommended`: the consumer **should** confirm but **may** proceed where the human has durably authorized this class of operation. |
| `warning` | no | Human-readable warning the consumer **should** surface to the human, substantially intact, before asking for confirmation. |

Like `workflows`, the annotation is carried on **both** surfaces that describe an operation — the catalogue entry and the schema document (`GET /commands/{schema}/{version}`) as a top-level member — and both **must** carry the same value.

The annotation is **descriptive, not enforcement**. It tells a well-behaved consumer what to do before submitting; it never replaces the server-side controls of [Security Requirements — high-impact commands](#security-requirements), because a server cannot rely on clients honoring it. Service-to-service automation with no human principal is governed by those server-side controls alone — the annotation does not require inventing a human to ask.

### Ingestion Semantics

`POST /commands` processing:

1. Validate required envelope attributes.
2. Look up the schema **in the server's own catalogue, keyed by `type`**.
3. Validate `data` against that schema.
4. Valid → durably queue and return `201 Created` with `{ "id": "<command id>", "correlationId": "<correlation identifier>" }`. Invalid → `400`.

- The inbound `dataschema` field is **informational metadata**, never an instruction. Servers **must not** fetch a caller-supplied `dataschema` URI (SSRF — see [Security](#security-requirements)).
- The envelope `id` is an **idempotency key**: duplicates (same `id` + authenticated source) are rejected or safely ignored; a reused `id` with a *different* payload returns `409`.
- `type` is the routing key. `source` **must not** be the sole routing key.
- **`201`, not `202`:** `201` signals the command was *durably* recorded and processing will happen. Use `202` only if your implementation cannot durably enqueue before responding.

### Command Results and Correlation

BEST defines **no synchronous command response**. The result of processing is one or more published events, tied to the command by the first-class **`correlationid`** envelope attribute:

```
POST /commands                       → 201 { "id": "abc123", "correlationId": "abc123" }
GET  /events?correlationId=abc123        → what has already happened
GET  /events/stream?correlationId=abc123 → what happens next (push)
```

The caller **may** set `correlationid` on the command; when omitted, the server adopts the command's `id` — either way the `201` response echoes the effective value as `correlationId`. Every event produced by processing the command **must** carry that identifier in its `correlationid` envelope attribute, so any consumer — including one that never saw the command — can match events to their originating submission. Multi-step processes propagate it: a follow-up command issued in reaction to an event **should** carry the same `correlationid`, which is what makes one identifier traverse a chain of services.

The schema document at `GET /commands/{schema}/{version}` **may** declare a `produces` array of PascalCase event types the command can raise (e.g. `["CounterProposed", "NegotiationFailed"]`). Failure outcomes are ordinary events in that list; naming conventions (`*Failed`) are service-defined. BEST defines no timeout protocol — services **should** document expected processing times and always publish a failure event rather than silently dropping a command; callers decide how long to wait. When the service publishes [workflows](#workflows--iobestagentsworkflows), the document **should** also carry the operation's `workflows` cross-link array; when the catalogue entry carries an [`impact` annotation](#impact-annotations), the document **must** carry the same annotation as a top-level `impact` member.

## Events — `io.best.agents.events`

Events are immutable facts published as the result of processing. Schema: [`events.json`](protocol/v1/schemas/agents/events.json)

| Method | Path | Description |
|---|---|---|
| GET | `/events` | **Historical query** — paginated, filterable log of past events; may double as the event catalogue |
| GET | `/events/stream` | **Live stream** — SSE; delivers events produced *after* the connection opens |
| GET | `/events/{schema}/{version}` | JSON Schema document for one event type/version |

`GET /events` and `GET /events/stream` are complementary: load history first, then open the stream.

**Typed vs untyped events:** an event with `dataschema` is typed — consumers can fetch the schema and validate. Without it, the event is untyped and the consumer interprets `data`; the envelope (`type`, `source`, `id`, `correlationid`, `time`) still supports routing and correlation. Both patterns can coexist in one service.

**No replay guarantee:** `GET /events` returns whatever the server currently exposes — a full log, a recent window, or a mapped view of domain records. Clients cannot assume completeness, ordering, or replay fidelity. For reliable point-in-time delivery, use a push channel.

### Query Parameters (`GET /events`)

| Parameter | Description |
|---|---|
| `type` | Filter by envelope `type` (PascalCase) |
| `correlationId` | Only events whose `correlationid` envelope attribute matches (the `correlationId` echoed by `POST /commands`) |
| `source` | Filter by publishing service |
| `from` / `to` | ISO 8601 time-range bounds (inclusive) |
| `limit` | Max results; servers may apply a lower ceiling |
| `after` | Opaque pagination cursor from a previous response's `nextCursor` |

Responses are an `eventList`: `{ "events": [...], "nextCursor": "..." }` — `nextCursor` present only when more pages exist.

### SSE Stream (`GET /events/stream`)

Request with `Accept: text/event-stream` plus credentials; optional filters `correlationId`, `type`, `source`. Each event arrives as an SSE `data` field with the envelope JSON; the envelope `id` is echoed as the SSE event `id`. On reconnect, clients send `Last-Event-ID` and the server replays anything produced after it. Servers **should** send `: keepalive` comments and **may** close after inactivity or a terminal event; clients **must** handle reconnection.

### Event Catalogue

`GET /events` may also serve catalogue entries mirroring the command catalogue: `schema` (kebab-case), `version`, optional `dataschema` (omitted for untyped events), `description`. Untyped events rely on `description` as primary documentation.

### Choosing a Delivery Channel

| Caller | Channel |
|---|---|
| Browser app, CLI, local agent | **SSE** |
| LLM client with an active MCP session | **MCP push** (`"push": true` on the `mcp` block) |
| Anything else | **Polling** `GET /events` — always available |

The events capability declares supported channels in its `push` block; check it before choosing.

## Queries — `io.best.agents.queries`

Queries are **synchronous reads** of current state — the read-before-write complement to commands (e.g. an agent lists broker accounts before referencing one in a command). Optional capability; declared in the manifest like any other. Schema: [`queries.json`](protocol/v1/schemas/agents/queries.json)

| Method | Path | Description |
|---|---|---|
| GET | `/queries` | Query catalogue — same entry shape as the command catalogue (`schema`, `version`, `dataschema`, `description`, optional `workflows`) |
| GET | `/queries/{schema}/{version}` | Query schema document |
| GET | `/queries/{schema}` | **Execute** — parameters as query string; returns `200` with the result body |

The schema document has up to three sections: `description`, `parameters` (JSON Schema for accepted query-string parameters — omitted when the query takes none), and `response` (JSON Schema for the result body; required) — plus the optional `workflows` cross-link array when the service publishes [workflows](#workflows--iobestagentsworkflows).

```
GET /queries                    → discover available queries
GET /queries/list-brokers/1.0   → learn parameters and response shape
GET /queries/list-brokers       → execute; 200 + JSON body
POST /commands                  → now you have the ID you needed
```

Execution returns `400` for missing/invalid parameters, `404` for an unknown schema name.

Queries are **not** a query language (no filter expressions, joins, or aggregations), not a REST resource hierarchy (no per-item GETs), and not event sourcing (they return current state as the service projects it — historical facts live in `GET /events`).

## Workflows — `io.best.agents.workflows`

Workflows are **published recipes**: read-only, named sequences of catalogue operations with per-step guidance, for multi-step processes whose order is a fixed, well-known happy path. The capability is **strictly descriptive** — the service never executes, retries, tracks, or branches the steps; the caller (typically an LLM agent) sends each operation itself and waits for its outcome before proceeding. Optional capability; declared in the manifest like any other. Schema: [`workflows.json`](protocol/v1/schemas/agents/workflows.json)

| Method | Path | Description |
|---|---|---|
| GET | `/workflows` | Workflow index — `id`, `name`, `description` per recipe, **never the steps** |
| GET | `/workflows/{id}` | One full recipe with its ordered steps; `404` for an unknown id |

The index is deliberately shallow so a consumer can hold the entire list in one read and choose; full recipes are fetched one at a time.

**Workflow ids** are stable, service-defined, URL-path-safe strings — reverse-domain (`io.example.workflows.onboard-a-worker`) or kebab-case. Renaming an id is a breaking change for anything linking to it.

**Steps.** Each step carries:

| Field | Required | Description |
|---|---|---|
| `kind` | yes | `"command"` or `"query"` — whether the step is a `POST /commands` or a `GET /queries/{schema}` |
| `dataschema` | yes | Resolvable URI of the operation's schema document in this service's **live catalogue** — recipes reference the catalogue, never duplicate it, so they cannot drift from the real contracts |
| `optional` | no | `true` when the step applies only in some runs; absent means required |
| `guidance` | no | How this step combines with the others — what to carry forward, what to wait for, when to skip. Anything about the single operation in isolation belongs in that operation's schema description instead. |

```json
GET /workflows/io.example.workflows.onboard-a-worker
{
  "id": "io.example.workflows.onboard-a-worker",
  "name": "Onboard a worker",
  "description": "Create the engagement, assign a contact, and invite the worker. Drive each step yourself and wait for its outcome before the next.",
  "steps": [
    { "kind": "command", "dataschema": "https://api.example.com/commands/submit-employee/1.0",
      "guidance": "Creates the engagement. Keep the correlationId — every later step references it." },
    { "kind": "query",   "dataschema": "https://api.example.com/queries/list-employees/1.0",
      "guidance": "Poll until the new engagement appears — commands are asynchronous." },
    { "kind": "command", "dataschema": "https://api.example.com/commands/invite-worker/1.0",
      "optional": true, "guidance": "Only when the user wants the invitation sent immediately." }
  ]
}
```

**Cross-linking — the single discoverability mechanism.** The protocol defines exactly one way an operation advertises the recipes it belongs to: the **`workflows` array** — the ids of the published workflows the operation participates in — carried wherever the operation is described:

- on its **catalogue entry** (`GET /commands`, `GET /queries`), and
- on its **schema document** (`GET /commands/{schema}/{version}`, `GET /queries/{schema}/{version}`) as a top-level member. JSON Schema tolerates unknown keywords, and BEST names this one; validators ignore it.

Both surfaces carry the same array, so the pointer is present at whichever read a consumer performs before acting. Servers publishing workflows **should** stamp it in both places for every operation that appears in a recipe; consumers **should** fetch the referenced recipe (`GET /workflows/{id}`) before composing a multi-step sequence themselves. Human-readable descriptions are free to mention recipes, but the protocol attaches **no** discoverability role to prose — the cross-link array is the mechanism, and there is no other.

**Boundary.** The moment a service executes, retries, persists, or branches steps on the caller's behalf, it has built an execution runtime — out of BEST scope, and not something to put behind this capability (put Temporal, Durable Functions, or similar *behind* the service instead).

> Before 0.9.4 this surface existed only as a vendor-extension convention (`/workflows` under an implementer-owned namespace). Existing publishers migrate by declaring the capability, splitting the old full-list response into index + per-id detail, and adopting the step shape above.

## Composing Multi-Step Processes

BEST deliberately owns no orchestration. Two patterns cover multi-step work:

- **Choreography** — the caller sends a command, observes correlated events, decides the next command. Needs nothing beyond the core.
- **Published workflows** — the service publishes the fixed happy-path recipe via the optional [workflows capability](#workflows--iobestagentsworkflows); the caller still drives each step and waits for its outcome before the next.

The moment a service executes, retries, persists, or branches steps on the caller's behalf, it has become an execution runtime — out of BEST scope (put Temporal, Durable Functions, or similar *behind* the service).

## HTTP Transport

HTTP is the **baseline transport** — every conformant service exposes it. All requests and responses are `application/json` (schemas are `application/schema+json`; SSE is `text/event-stream`).

**Path resolution:** every capability path is appended to the service's `http.endpoint`. The leading slash is a separator, not a root-relative indicator:

| `http.endpoint` | Path | Resolved |
|---|---|---|
| `https://app.example.com/` | `/commands` | `https://app.example.com/commands` |
| `https://api.example.com/tenants/acme` | `/commands` | `https://api.example.com/tenants/acme/commands` |

`http.endpoint` **must** be the consumer-facing public address — never an internal backend or service-mesh URL.

**Authentication:** per the manifest's `authentication` block — `bearer` → `Authorization: Bearer <token>`; `apiKey` → header or query parameter named in `scheme`; everything except `GET /.well-known/best` requires credentials when declared.

**Errors:** all endpoints use a consistent body ([`error.json`](protocol/v1/schemas/error.json)):

```json
{ "error": { "code": "SCHEMA_NOT_FOUND", "message": "Unknown command schema 'foo'", "details": {} } }
```

**Status codes:**

| Status | When |
|---|---|
| 200 | Success with body (queries, event lists, catalogues, schema documents) |
| 201 | Created — command accepted and durably queued |
| 202 | Accepted without durability guarantee (see [Ingestion Semantics](#ingestion-semantics)) |
| 400 | Invalid request body or parameters (schema validation failure) |
| 401 | Missing/invalid credentials (only when `authentication.type` is not `none`) |
| 404 | Unknown route, schema name, or version |
| 409 | Conflict — duplicate command `id` with different payload |
| 413 | Request body exceeds server limits |
| 422 | Semantic error (capability not supported) |
| 500 | Internal error |

## MCP Transport

MCP (Model Context Protocol) lets any off-the-shelf LLM client (Claude Desktop, VS Code Copilot, Cursor, ChatGPT Desktop) interact with a BEST service with zero bespoke integration. It is declared in the manifest's `mcp` block only when supported.

> **MCP is an adapter for clients you don't control.** Every MCP tool wraps exactly one HTTP endpoint. For code you own, call the BEST HTTP surface directly — putting an MCP server between your own client and the service adds a hop, flattens structured errors into prose, and widens your supply chain for nothing.

### Tool Mapping

The reference server [`@behavioralstate/best-mcp`](mcp-server/README.md) exposes:

| MCP tool | BEST operation |
|---|---|
| `list_connections` | Enumerate configured endpoints (only in multi-connection mode) |
| `get_command_catalogue` | `GET /commands` |
| `get_command_schema` | `GET /commands/{schema}/{version}` |
| `send_command` | `POST /commands` (envelope built automatically) |
| `send_command_and_wait` | `POST /commands`, then poll a named query until its result contains an expected value (or timeout) |
| `get_query_catalogue` | `GET /queries` |
| `get_query_schema` | `GET /queries/{schema}/{version}` |
| `execute_query` | `GET /queries/{schema}` |
| `get_workflows` | `GET /workflows` (index), or `GET /workflows/{id}` when `workflow_id` is passed — the optional [workflows capability](#workflows--iobestagentsworkflows); returns a note when the service publishes none |
| *(push)* | Server-to-client MCP notifications deliver correlated events when `"push": true` |

`send_command` derives the envelope `type` by PascalCase conversion of the schema name (`configure-broker → ConfigureBroker`), sets `dataschema` to the absolute catalogue URI (`{endpoint}/commands/{schema}/{version}`), and requires the caller to supply `source` — the expected value is documented in the schema description, never invented.

### Manifest Declaration

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

`transport` is `stdio`, `sse`, or `http`; `server` is the identifier or URL. `mcp.authentication` is independent of the root block — each transport declares its own requirements. The `headers` array supports multi-header schemes (key + tenant ID); the optional `example` field lets IDE tooling pre-fill values from a per-tenant manifest.

Configuration of the reference server (per-app `BEST_<APP>_*` env vars, `BEST_CONNECTIONS`, legacy single-connection, transports, credential passthrough) is documented in the [mcp-server README](mcp-server/README.md). Production deployments should pin an exact package version.

## Agent Navigation Guide

The canonical first-contact algorithm for an AI agent or automated client:

**1. Fetch the root manifest** — `GET /.well-known/best` (always public). Extract `authentication` and `tenants.manifest` before anything else.

**2. Identify the manifest type and collect prerequisites — before making any authenticated request:**

| Root manifest shows | Meaning | Collect from the user |
|---|---|---|
| `capabilities` contains `io.best.agents.commands` | Direct service | Credentials only (if auth declared) |
| `tenants.manifest` present, no commands capability | Multi-tenant router | **Credentials and tenant ID, in one prompt** |
| Commands capability with `status: "planned"` | Not implemented yet | — (report to user) |
| Empty `capabilities`, no `tenants.manifest` | No discoverable surface | — (report to user) |

**3. Multi-tenant only:** expand the template with the tenant ID, fetch the tenant manifest with credentials, then treat it exactly like a direct service manifest.

**4. Read the capability's `endpoints` array** and resolve each path against the `http.endpoint` of the service named in the capability's `service` field (or the matching-prefix service if absent).

**5. Fetch the catalogues** — `GET /commands` (and `GET /queries` if declared) is the definitive answer to "what can I do here." Then: fetch the schema for the chosen operation, execute, and observe results via `?correlationId=`.

> **Never fall back to external OpenAPI/Swagger documents.** The BEST manifest is the canonical discovery surface; an implementer's Swagger describes their application API, not the BEST catalogue.

## Conformance

A BEST-compliant endpoint **must**:

1. Expose `GET /.well-known/best` returning a valid manifest — `200`, public, `application/json`
2. Include at least one service in the manifest
3. List all supported capabilities with valid schema URLs
4. Implement the HTTP API for every listed capability
5. Return valid JSON conforming to the referenced schemas
6. Use standard HTTP status codes and the BEST error format
7. Declare authentication in the manifest (or omit for public) — never an undocumented `401`

Per-capability required endpoints (for `active` capabilities; `partial` is exempt but must document available routes in `endpoints`):

| Capability | Required endpoints |
|---|---|
| `io.best.agents.commands` | `GET /commands`, `POST /commands` |
| `io.best.agents.events` | `GET /events` |
| `io.best.agents.queries` | `GET /queries`, `GET /queries/{schema}/{version}`, `GET /queries/{schema}` |
| `io.best.agents.workflows` | `GET /workflows`, `GET /workflows/{id}` |

Multi-tenant root manifests additionally follow the [Multi-Tenancy rules](#multi-tenancy).

Compliance does **not** require: any specific language, framework, or architecture; any specific event transport; MCP support; or AI/LLM capabilities — a BEST service can be deterministic or human-operated.

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`). The version string appears at the manifest root, on each service, and on each capability; capabilities may carry different versions in one manifest.

| Change | Bump |
|---|---|
| Breaking — field removal, type change, semantic change | MAJOR |
| Additive — new optional fields, new capabilities | MINOR |
| Docs, clarifications, non-breaking fixes | PATCH |

Consumers **must ignore unknown fields** (forward compatibility). All BEST identifiers use reverse-domain notation; `io.best.*` is reserved for the specification.

## Security Requirements

Condensed from the normative set — every conformant implementation observes these:

- **TLS** — HTTPS everywhere in production; MCP transports must provide TLS-equivalent confidentiality; validate certificates; never send credentials over insecure transports.
- **Auth** — only `GET /.well-known/best` is unauthenticated. `GET /events` requires auth and tenant-scoped authorisation unless explicitly public. Distinct Read/Write scopes are recommended.
- **`dataschema` SSRF** — servers select validation schemas from their own catalogue keyed by `type`; they **must not** fetch caller-supplied `dataschema` URIs, and **should** reject commands whose `dataschema` doesn't match a catalogue entry.
- **Replay protection** — envelope `id` is an idempotency key; duplicates rejected within a retention window, scoped to the authenticated tenant/sender; same `id` + different payload → `409`.
- **`source` is untrusted** — caller-declared; never grant permissions or make security decisions from it; overwrite with (or record alongside) the verified principal for audit.
- **High-impact commands** — commands that are destructive, irreversible, or bypass a compliance control **should** require a control beyond the submitting credential (human approval, a second principal, out-of-band confirmation); that control **must not** be self-serviceable. Servers **should** declare the [`impact` annotation](#impact-annotations) on such commands so consumers can discover the obligation; the annotation never substitutes for the server-side control.
- **Tenant isolation** — tenant context derives from authenticated identity, never from caller-supplied paths/params/fields; caches, dedup stores, and streams isolated per tenant; guessing a tenant ID grants nothing.
- **Credential passthrough** (intermediaries such as MCP servers or gateways) — opt-in per connection, off by default; forward only to the configured endpoint; explicit per-request keys take precedence over ambient bearer tokens; never log credentials; multi-user intermediaries should fail closed.
- **Input limits** — bound body size (`413`), JSON depth, collection sizes, string lengths; rate-limit per client and per tenant.
- **Manifest hygiene** — the public manifest carries only information intended for unauthenticated disclosure; no internal addresses, credential hints, or sensitive integration names. This applies to [`extensions`](#extensions) content identically — an extension is not a private channel.
