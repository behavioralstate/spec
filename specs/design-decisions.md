# Design Decisions

This page documents the reasoning behind key BEST design choices. It is aimed at implementers who want to understand *why* the protocol is shaped the way it is, and at contributors evaluating future changes.

---

## Command Result Retrieval

### The decision

BEST does not define a synchronous response to a command. `POST /commands` returns `201 Created` to confirm the command was accepted and queued — not that it was processed. The result of processing is one or more domain events, retrieved separately.

### Why

Commands are **intents to change** a domain service. In CQRS, the write side accepts commands asynchronously and decouples them from the read side. Returning the processing result synchronously in the `POST /commands` response would couple the caller to the service's internal processing time and force a blocking API — which conflicts with this decoupled model.

The result of processing is a **published domain event** — an immutable fact that something happened, exposed via `GET /events`. This is a *notification* that the caller can observe. It is not an Event Sourcing replay mechanism.

> **Event Sourcing is an internal server pattern, not a client capability.** A service *may* use Event Sourcing internally — storing state as a replayable log of events. But clients do not get Event Sourcing semantics. `GET /events` returns whatever the server currently exposes from its event log at the time of the query. That might be a full historical log, a recent window, or a current-state view mapped to the BEST event shape (the protocol explicitly allows any of these). Clients cannot assume they can reconstruct state by replaying events from `GET /events` — the endpoint does not guarantee completeness, ordering, or replay fidelity.

The practical implication: if a caller polls `GET /events?correlationId=...` some time after submitting a command, they receive the server's current view at that moment — which may or may not include the event they are looking for, depending on how long the server retains event history. **For reliable point-in-time delivery, use a push channel** (webhook or MCP notification), which fires at the moment of publication.

### How to retrieve results

The canonical retrieval path uses the correlation identifier returned in the `201` response:

```
POST  /commands                        → 201 { "id": "abc123" }
GET   /events?correlationId=abc123     → [ { "type": "CounterProposed", ... } ]
```

The `id` in the `201` response is the **correlation identifier** — it is the command's CloudEvent `id`, echoed back so callers can match incoming events to their command. The field name used inside an event payload to carry this identifier is agreed between client and server; BEST does not mandate it.

### Polling vs push

Polling `GET /events?correlationId=...` is the fallback and the simplest path. For callers that need lower latency or want to avoid polling loops, three push channels are available:

| Channel | How declared | Best for |
|---|---|---|
| **Webhook** | `webhook.url` registered via `POST /subscriptions` | HTTP clients running their own HTTP server |
| **MCP notification** | `"push": true` on `mcp` transport block | LLM tooling with an active MCP session |

The service declares which push channels it supports in the `io.best.agents.events` capability's `push` object. Callers should check this before choosing a channel.

### Timeout and silent failures

BEST does not define a timeout protocol. If a service processes a command but produces no event (a silent failure), the caller is responsible for deciding how long to wait before treating the operation as failed. Services **should** document their expected processing times and always produce a failure event (e.g. `NegotiationFailed`, `OrderRejected`) rather than silently dropping a command.

---

## Observability and Distributed Tracing

### The decision

BEST does not define a tracing capability. The protocol surface is: commands in, events out. What happens inside a service — how long each step took, which internal components were involved, what reasoning was applied — is the service's own concern.

### Why

A tracing capability that the protocol owns would need to answer: "what happened when service X processed command Y?" The answer is almost entirely implementation-specific. One service might be a Python ML pipeline; another might be a human-in-the-loop workflow; another might be a CQRS aggregate with event sourcing. There is no protocol-level trace shape that fits all of these without either being uselessly generic or encoding implementation assumptions.

More importantly, the BEST interaction surface already provides the observable facts a caller cares about:
- **What went in**: the command (callers sent it, so they already have it)
- **What came out**: the events (`GET /events?correlationId=...`)
- **Whether it succeeded**: absence of a success event after timeout, or presence of a failure event

Anything deeper than this — step duration, internal reasoning, span trees — is **platform observability**, not protocol observability.

### Using OpenTelemetry for deep tracing

For services and callers that need distributed tracing across the BEST boundary, use **OpenTelemetry** with [W3C TraceContext](https://www.w3.org/TR/trace-context/) header propagation.

#### Caller side

When submitting a command, inject the `traceparent` header into the HTTP request:

```
POST /commands
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
Content-Type: application/json

{ "specversion": "1.0", "type": "ProposeCounter", ... }
```

This allows the service to link its internal spans to the caller's trace.

#### Service side

BEST-compliant services **should** propagate the `traceparent` and `tracestate` headers from the incoming command request into any internal processing spans and into any outbound HTTP calls they make during command processing. This is standard OpenTelemetry HTTP instrumentation — most frameworks handle it automatically.

#### Events carrying trace context

The [CloudEvents OpenTelemetry extension](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md) defines a `traceparent` extension attribute on CloudEvent envelopes. Services **may** include this on published events to allow downstream consumers to link their processing spans back to the original trace tree:

```json
{
  "specversion": "1.0",
  "type": "CounterProposed",
  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  ...
}
```

This is optional and orthogonal to BEST. A service that includes `traceparent` on events is not more or less BEST-compliant — it is simply more instrumented.

#### Summary

| Concern | Owner | Tool |
|---|---|---|
| What command was sent | Caller | CloudEvent `id` + `POST /commands` |
| What events came out | Caller | `GET /events?correlationId=...` |
| End-to-end latency across services | Platform | OpenTelemetry + W3C TraceContext |
| Internal step timing and spans | Service | OpenTelemetry service instrumentation |
| Distributed trace tree | Platform | OpenTelemetry collector + backend (Jaeger, Tempo, etc.) |

BEST tells you *what* happened. OpenTelemetry tells you *how* and *when* it happened across a distributed system. They are complementary, not competing.

---

## Client Neutrality

### The decision

BEST is a **multi-implementer protocol**. The spec, its reference tooling (including `best-mcp`), and its documentation must remain neutral — they must not assume, require, or prefer any specific client, framework, authentication scheme, or deployment model. This applies especially to authentication, which varies widely across BEST-compliant services.

### Why

A protocol that is shaped around a single implementation is not a protocol — it is a proprietary API with a thin abstraction layer. BEST's value comes from interoperability: any agent should be able to discover and interact with any BEST-compliant endpoint without requiring service-specific adaptations.

Authentication is the most common place where this principle is violated in practice. Different services legitimately use different schemes:

| Scheme | How it works | Common for |
|---|---|---|
| `bearer` | `Authorization: Bearer <token>` | OAuth2, JWT, opaque tokens |
| `apikey` (header) | Custom header, e.g. `X-Api-Key: <key>` | API gateways, developer portals |
| `apikey` (query) | URL param, e.g. `?apikey=<key>` | IoT devices, webhook endpoints |
| `none` | No credentials | Public or intranet endpoints |

A single service may even expose **multiple auth schemes** — for example, JWT Bearer for user-facing web clients and a custom API key header for machine-to-machine BaaS callers. Both are valid; the spec accommodates both.

### Requirements

- The `best-mcp` server **must** support all `authentication.type` values defined in the discovery manifest and **must not** hardcode any single scheme.
- Any new reference tooling or documentation example **must** use a generic, spec-neutral form (e.g. `Authorization: Bearer <token>` as the bearer example, a placeholder header name for `apikey`).
- Implementation-specific auth details (header names, token formats, credential stores) **must not** appear in the protocol spec or shared tooling. They belong in the implementer's own documentation.
- When the spec or tooling ships a **default**, that default must be the most widely deployed standard: `bearer` (`Authorization: Bearer`) is the default auth type because it is the RFC 6750 standard for token-based APIs.

### Summary

> **BEST defines the interaction surface. It does not own the identity layer.** Every deployment of BEST is different; every deployment of `best-mcp` is different. The protocol provides the vocabulary (`authentication.type`, `authentication.scheme`, `authentication.in`); the deployment provides the credentials. Neither the spec nor shared tooling ever hardcodes one.

---

## Registry and Lifecycle removed

### The decision

The `io.best.agents.registry` and `io.best.agents.lifecycle` capabilities have been **removed** from the protocol. The operations they defined — register, deregister, list, get, pause, resume, heartbeat — are now expressed with the core command, query, and event primitives. The service descriptor remains a normative concept, re-homed onto the discovery manifest's `agents` array.

### Why

The registry and lifecycle capabilities were the only part of BEST built on resource CRUD (`POST /services`, `GET /services/{id}`, `DELETE /services/{id}`, `POST /services/{id}/pause`) — the exact noun-and-verbs model the protocol defines itself against (see [BEST vs REST](./comparisons/rest.md)). More fundamentally, managing services is not a protocol concern: it is a **domain**, and BEST already expresses any domain as commands in, queries for reads, and events out. There was no use case these capabilities covered that the core primitives did not cover better — the same argument that earlier retired [`io.best.agents.memory`](#service-metadata-vs-memory).

Collapsing them removes bespoke endpoints rather than adding them: registration becomes a `RegisterService` command through the single `POST /commands` entry point, reads become a `list-services` query, and fleet changes (`ServiceRegisteredV1`, `ServicePausedV1`, `ServiceErroredV1`) flow through `GET /events`. The control plane becomes a BEST service that speaks the protocol like any other.

### What stays

- **Discovery** (`/.well-known/best`) remains — it is the bootstrap that cannot itself be a command.
- **The service descriptor** (`id`, `name`, `accepts`, `produces`, `status`, `metadata`, …) remains normative, now declared in the manifest's `agents` array rather than served from a live `GET /services`.
- **A naming recommendation** (`RegisterService` / `list-services` / `ServiceRegisteredV1`) is documented as a non-normative example in [Registry](./agents/registry.md), for implementers who want a cross-legible service-management vocabulary.

---

## A2A Transport removed

### The decision

The A2A (Google Agent-to-Agent) transport binding has been **removed** from the protocol. BEST defines two consumer-facing transport bindings — HTTP (the baseline) and MCP — plus an optional gRPC binding for internal runtimes. The `a2a` transport block and the `push.a2a` delivery channel are gone from the discovery manifest schema.

### Why

The binding added spec surface without adding capability. A2A is itself HTTP/JSON: an A2A-speaking agent that wants to call a BEST service can already do so through the HTTP binding, and LLM-tooling consumers are served by MCP. The A2A mapping (Agent Card ↔ manifest, Task ↔ execution trace, Message ↔ command/event) duplicated semantics the existing bindings already carry, while dragging in A2A's own task lifecycle — a coordination model BEST deliberately does not own (commands in, events out; see [Command Result Retrieval](#command-result-retrieval)).

The binding also never had an implementation or a known consumer. Keeping an untested normative surface alive costs every implementer conformance ambiguity ("do I need an Agent Card?") for zero interoperability gain. If a concrete multi-agent deployment ever needs A2A-native delivery, the binding can be reintroduced as an extension informed by that real use — the manifest's `transports` object is deliberately open to new bindings.

### What stays

- **HTTP** remains the baseline every conformant service must expose; **MCP** remains the LLM-tooling binding; **gRPC** remains optional for internal runtimes.
- Push delivery keeps its three channels: SSE, webhook, and MCP notifications.

---

## Service Metadata vs. Memory

### The decision

The service descriptor carries an optional `metadata` field — an opaque JSON object holding service-defined configuration (e.g. model name, system prompt, provider settings). The `io.best.agents.memory` capability has been **removed** from the protocol. The `GET /events` endpoint covers the remaining use case for accumulated historical state.

The descriptor is declared in the discovery manifest's `agents` array. Where a service is registered dynamically, registration uses **upsert semantics** via the `RegisterService` command (see [Registry](./agents/registry.md)): submitting a registration for an existing `id` fully replaces the descriptor.

### Why metadata on the descriptor

Agent services — particularly AI-backed ones — need to expose static operational configuration as part of their identity: which model they run, what system prompt they use, what context window size applies. This is configuration the service *is*, not state the service *has* accumulated. It belongs on the thing that describes the service: the service descriptor.

### Why memory was removed

The `io.best.agents.memory` capability had a single endpoint — `GET /services/{id}/memory` — returning a fully opaque blob with no prescribed structure. Two problems:

1. **Static config** (model, prompt, provider settings) belongs on the service descriptor as `metadata`. It is known at deployment time and changes only when the service is deliberately reconfigured.
2. **Dynamic/accumulated state** (conversation history, audit trail, event log) is already served by `GET /events` — a queryable log that filters by type, source, time range, and correlation ID.

There was no remaining use case that `memory` covered that one of these two didn't cover better. The capability was removed rather than deprecated because no implementation had shipped against it.

### Why `GET /events` is the right home for event history

`GET /events` with `?type=ChatKitMessageRememberedV1` returns all events of that type across all interactions — ordered, filterable by time range and source, paginated. This is a proper queryable log, not a memory endpoint. The distinction matters: callers can reconstruct any historical view they need without a bespoke memory API.

### Why upsert and not a separate update command

A distinct "update" command would be functionally equivalent to re-sending `RegisterService` with the same `id`. Services re-register on restart anyway; making registration idempotent by `id` aligns with reality and eliminates a separate write path.

### Why not `config`, `settings`, or `properties`

- `config` and `settings` imply a narrower, application-specific scope.
- `properties` conflicts visually with the JSON Schema keyword of the same name.
- `metadata` is the established term in REST APIs, Kubernetes, and the broader cloud-native ecosystem for opaque, non-structural attributes attached to a resource.

---

## HTTP API vs REST

### The decision

BEST describes its transport binding as an **HTTP API**, not a HTTP API. The spec uses "HTTP" throughout when referring to the transport layer.

### Why BEST is not REST

REST (Representational State Transfer) is a specific architectural style defined by Roy Fielding in his 2000 dissertation. A fully REST-compliant system requires:

- **HATEOAS** (Hypermedia as the Engine of Application State) — responses carry hypermedia links to next available actions; clients never construct URLs from prior knowledge
- **Uniform resource interface** — the API is modelled around resources identified by URIs, manipulated through their representations
- **Stateless interactions** — no server-side session state between requests

BEST fails on HATEOAS immediately. Callers construct URLs like `GET /events?type=X&from=Y` from prior knowledge. The `/.well-known/best` manifest is a URL directory, not a hypermedia document. BEST is semantically a **message-passing system** — commands flow in, events flow out — not a resource manipulation system.

### What BEST actually is

BEST is an **HTTP API**: it uses HTTP verbs, HTTP status codes, and JSON payloads over HTTPS. It is not REST. It is not RPC. It is a message-passing protocol with an HTTP transport binding.

The distinction matters for implementers:
- Do not design BEST endpoints as resource hierarchies — `GET /events/{id}` is not a BEST primitive
- Do not add hypermedia links to BEST responses
- Do design around the command/event message flow: `POST /commands` → `GET /events`

### Why the schema field is named `http`

The transport binding block in the discovery manifest is named `"http"` — consistent with BEST's HTTP API terminology throughout. The field was previously named `"rest"` and was renamed as part of the major version bump that removed the REST label from the spec.

---

## CloudEvent Deviations

### The decision

BEST uses the CloudEvent 1.0 envelope as its wire format for commands and events, but **does not conform to the CloudEvent 1.0 specification**. BEST borrows the shape — eight well-known fields that LLMs and tooling already understand — without committing to full spec compliance.

### Why

CloudEvent 1.0 is a widely understood, well-structured envelope that LLM clients can read, reason about, and generate natively. Using it means BEST messages are immediately recognisable and usable by existing tooling without custom parsing. However, some CloudEvent rules conflict with BEST's design goals — particularly around `source` routing, relative `dataschema` URIs, and the extension attribute model. Rather than bending BEST's design to fit the spec, we adopt the shape and document the deviations explicitly.

### Deviations

| Field / Rule | CloudEvent 1.0 | BEST behaviour | Reason |
|---|---|---|---|
| `dataschema` format | Must be an absolute URI | BEST uses a relative URI: `{schema}/{version}` (e.g. `configure-broker/1.0`). Absolute URIs appear in catalogue entries but not necessarily on the wire. | Relative URIs are portable across environments (dev, staging, prod) without requiring callers to know the host. The server resolves to its own catalogue — a caller-supplied absolute URI would create an SSRF risk. |
| `source` semantics | Should be a URI identifying the origin | BEST allows any string — URI, routing key, label, or any identifier meaningful to the implementation | `source` has proven useful as a lightweight routing key in multi-tenant backends. Forcing URI format adds no protocol value. |
| `type` casing | No casing requirement | BEST mandates PascalCase (e.g. `ProposeCounter`) | Consistency for LLM tooling; catalogue `schema` names are kebab-case, `type` is PascalCase — they are distinct fields with distinct purposes. |
| `datacontenttype` values | Any MIME type | BEST restricts to `"application/json"` | BEST is JSON-only. Allowing other content types would require out-of-band schema negotiation the protocol does not define. |
| Extension attributes | Allowed (open `additionalProperties`) | BEST schemas use `additionalProperties: false` — extensions are blocked | Extensions would silently pass through servers that don't understand them, making it impossible to reason about what a conformant BEST message contains. Explicit fields only. |

### Implication for implementers

- Do not validate BEST messages against a CloudEvent 1.0 schema validator — they will fail on `dataschema` format and `additionalProperties`.
- Do not use CloudEvent SDK libraries that enforce spec compliance for constructing BEST messages.
- `best-mcp` and BEST tooling construct the envelope as documented here — not as per the CloudEvent spec.
- If you need genuine CloudEvent 1.0 compliance (e.g. for integration with a CloudEvents broker), adapt the envelope at the boundary.
