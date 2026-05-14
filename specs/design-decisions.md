# Design Decisions

This page documents the reasoning behind key BSP design choices. It is aimed at implementers who want to understand *why* the protocol is shaped the way it is, and at contributors evaluating future changes.

---

## Command Result Retrieval

### The decision

BSP does not define a synchronous response to a command. `POST /commands` returns `201 Created` to confirm the command was accepted and queued — not that it was processed. The result of processing is one or more domain events, retrieved separately.

### Why

Commands are **intents to change** a domain service. In CQRS, the write side accepts commands asynchronously and decouples them from the read side. Returning the processing result synchronously in the `POST /commands` response would couple the caller to the service's internal processing time and force a blocking API — which conflicts with this decoupled model.

The result of processing is a **published domain event** — an immutable fact that something happened, exposed via `GET /events`. This is a *notification* that the caller can observe. It is not an Event Sourcing replay mechanism.

> **Event Sourcing is an internal server pattern, not a client capability.** A service *may* use Event Sourcing internally — storing state as a replayable log of events. But clients do not get Event Sourcing semantics. `GET /events` returns whatever the server currently exposes from its event log at the time of the query. That might be a full historical log, a recent window, or a current-state view mapped to the BSP event shape (the protocol explicitly allows any of these). Clients cannot assume they can reconstruct state by replaying events from `GET /events` — the endpoint does not guarantee completeness, ordering, or replay fidelity.

The practical implication: if a caller polls `GET /events?correlationId=...` some time after submitting a command, they receive the server's current view at that moment — which may or may not include the event they are looking for, depending on how long the server retains event history. **For reliable point-in-time delivery, use a push channel** (webhook, MCP notification, or A2A message), which fires at the moment of publication.

### How to retrieve results

The canonical retrieval path uses the correlation identifier returned in the `201` response:

```
POST  /commands                        → 201 { "id": "abc123" }
GET   /events?correlationId=abc123     → [ { "type": "CounterProposed", ... } ]
```

The `id` in the `201` response is the **correlation identifier** — it is the command's CloudEvent `id`, echoed back so callers can match incoming events to their command. The field name used inside an event payload to carry this identifier is agreed between client and server; BSP does not mandate it.

### Polling vs push

Polling `GET /events?correlationId=...` is the fallback and the simplest path. For callers that need lower latency or want to avoid polling loops, three push channels are available:

| Channel | How declared | Best for |
|---|---|---|
| **Webhook** | `webhook.url` on service descriptor at `POST /services` | HTTP clients running their own HTTP server |
| **MCP notification** | `"push": true` on `mcp` transport block | LLM tooling with an active MCP session |
| **A2A message** | implicit when A2A transport is active | Agent-to-agent coordination |

The service declares which push channels it supports in the `io.bsp.agents.events` capability's `push` object. Callers should check this before choosing a channel.

### Timeout and silent failures

BSP does not define a timeout protocol. If a service processes a command but produces no event (a silent failure), the caller is responsible for deciding how long to wait before treating the operation as failed. Services **should** document their expected processing times and always produce a failure event (e.g. `NegotiationFailed`, `OrderRejected`) rather than silently dropping a command.

---

## Observability and Distributed Tracing

### The decision

BSP does not define a tracing capability. The protocol surface is: commands in, events out. What happens inside a service — how long each step took, which internal components were involved, what reasoning was applied — is the service's own concern.

### Why

A tracing capability that the protocol owns would need to answer: "what happened when service X processed command Y?" The answer is almost entirely implementation-specific. One service might be a Python ML pipeline; another might be a human-in-the-loop workflow; another might be a CQRS aggregate with event sourcing. There is no protocol-level trace shape that fits all of these without either being uselessly generic or encoding implementation assumptions.

More importantly, the BSP interaction surface already provides the observable facts a caller cares about:
- **What went in**: the command (callers sent it, so they already have it)
- **What came out**: the events (`GET /events?correlationId=...`)
- **Whether it succeeded**: absence of a success event after timeout, or presence of a failure event

Anything deeper than this — step duration, internal reasoning, span trees — is **platform observability**, not protocol observability.

### Using OpenTelemetry for deep tracing

For services and callers that need distributed tracing across the BSP boundary, use **OpenTelemetry** with [W3C TraceContext](https://www.w3.org/TR/trace-context/) header propagation.

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

BSP-compliant services **should** propagate the `traceparent` and `tracestate` headers from the incoming command request into any internal processing spans and into any outbound HTTP calls they make during command processing. This is standard OpenTelemetry HTTP instrumentation — most frameworks handle it automatically.

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

This is optional and orthogonal to BSP. A service that includes `traceparent` on events is not more or less BSP-compliant — it is simply more instrumented.

#### Summary

| Concern | Owner | Tool |
|---|---|---|
| What command was sent | Caller | CloudEvent `id` + `POST /commands` |
| What events came out | Caller | `GET /events?correlationId=...` |
| End-to-end latency across services | Platform | OpenTelemetry + W3C TraceContext |
| Internal step timing and spans | Service | OpenTelemetry service instrumentation |
| Distributed trace tree | Platform | OpenTelemetry collector + backend (Jaeger, Tempo, etc.) |

BSP tells you *what* happened. OpenTelemetry tells you *how* and *when* it happened across a distributed system. They are complementary, not competing.

---

## Service Metadata vs. Memory

### The decision

The service descriptor carries an optional `metadata` field — an opaque JSON object holding service-defined configuration (e.g. model name, system prompt, provider settings). The `io.bsp.agents.memory` capability has been **removed** from the protocol. The `GET /events` endpoint covers the remaining use case for accumulated historical state.

`POST /services` uses **upsert semantics**: submitting a registration for an existing `id` fully replaces the descriptor. There is no separate `PATCH` or `PUT` endpoint for the service descriptor.

### Why metadata on the descriptor

Agent services — particularly AI-backed ones — need to expose static operational configuration as part of their identity: which model they run, what system prompt they use, what context window size applies. This is configuration the service *is*, not state the service *has* accumulated. It belongs on the thing that describes the service: the service descriptor.

### Why memory was removed

The `io.bsp.agents.memory` capability had a single endpoint — `GET /services/{id}/memory` — returning a fully opaque blob with no prescribed structure. Two problems:

1. **Static config** (model, prompt, provider settings) belongs on the service descriptor as `metadata`. It is known at deployment time and changes only when the service is deliberately reconfigured.
2. **Dynamic/accumulated state** (conversation history, audit trail, event log) is already served by `GET /events` — a queryable log that filters by type, source, time range, and correlation ID.

There was no remaining use case that `memory` covered that one of these two didn't cover better. The capability was removed rather than deprecated because no implementation had shipped against it.

### Why `GET /events` is the right home for event history

`GET /events` with `?type=ChatKitMessageRememberedV1` returns all events of that type across all interactions — ordered, filterable by time range and source, paginated. This is a proper queryable log, not a memory endpoint. The distinction matters: callers can reconstruct any historical view they need without a bespoke memory API.

### Why upsert and not a separate update endpoint

A `PATCH /services/{id}` endpoint would be functionally equivalent to re-registering with the same `id`. Services re-register on restart anyway; making `POST /services` idempotent aligns with reality and eliminates a separate write path. Re-registering preserves existing subscriptions; `DELETE /services/{id}` is the only operation that removes them.

### Why not `config`, `settings`, or `properties`

- `config` and `settings` imply a narrower, application-specific scope.
- `properties` conflicts visually with the JSON Schema keyword of the same name.
- `metadata` is the established term in REST APIs, Kubernetes, and the broader cloud-native ecosystem for opaque, non-structural attributes attached to a resource.

---

## HTTP API vs REST

### The decision

BSP describes its transport binding as an **HTTP API**, not a HTTP API. The spec uses "HTTP" throughout when referring to the transport layer.

### Why BSP is not REST

REST (Representational State Transfer) is a specific architectural style defined by Roy Fielding in his 2000 dissertation. A fully REST-compliant system requires:

- **HATEOAS** (Hypermedia as the Engine of Application State) — responses carry hypermedia links to next available actions; clients never construct URLs from prior knowledge
- **Uniform resource interface** — the API is modelled around resources identified by URIs, manipulated through their representations
- **Stateless interactions** — no server-side session state between requests

BSP fails on HATEOAS immediately. Callers construct URLs like `GET /events?type=X&from=Y` from prior knowledge. The `/.well-known/bsp` manifest is a URL directory, not a hypermedia document. BSP is semantically a **message-passing system** — commands flow in, events flow out — not a resource manipulation system.

### What BSP actually is

BSP is an **HTTP API**: it uses HTTP verbs, HTTP status codes, and JSON payloads over HTTPS. It is not REST. It is not RPC. It is a message-passing protocol with an HTTP transport binding.

The distinction matters for implementers:
- Do not design BSP endpoints as resource hierarchies — `GET /events/{id}` is not an BSP primitive
- Do not add hypermedia links to BSP responses
- Do design around the command/event message flow: `POST /commands` → `GET /events`

### Why the schema field is named `http`

The transport binding block in the discovery manifest is named `"http"` — consistent with BSP's HTTP API terminology throughout. The field was previously named `"rest"` and was renamed as part of the major version bump that removed the REST label from the spec.

---

## CloudEvent Deviations

### The decision

BSP uses the CloudEvent 1.0 envelope as its wire format for commands and events, but **does not conform to the CloudEvent 1.0 specification**. BSP borrows the shape — eight well-known fields that LLMs and tooling already understand — without committing to full spec compliance.

### Why

CloudEvent 1.0 is a widely understood, well-structured envelope that LLM clients can read, reason about, and generate natively. Using it means BSP messages are immediately recognisable and usable by existing tooling without custom parsing. However, some CloudEvent rules conflict with BSP's design goals — particularly around `source` routing, relative `dataschema` URIs, and the extension attribute model. Rather than bending BSP's design to fit the spec, we adopt the shape and document the deviations explicitly.

### Deviations

| Field / Rule | CloudEvent 1.0 | BSP behaviour | Reason |
|---|---|---|---|
| `dataschema` format | Must be an absolute URI | BSP uses a relative URI: `{schema}/{version}` (e.g. `configure-broker/1.0`). Absolute URIs appear in catalogue entries but not necessarily on the wire. | Relative URIs are portable across environments (dev, staging, prod) without requiring callers to know the host. The server resolves to its own catalogue — a caller-supplied absolute URI would create an SSRF risk. |
| `source` semantics | Should be a URI identifying the origin | BSP allows any string — URI, routing key, label, or any identifier meaningful to the implementation | `source` has proven useful as a lightweight routing key in multi-tenant backends. Forcing URI format adds no protocol value. |
| `type` casing | No casing requirement | BSP mandates PascalCase (e.g. `ProposeCounter`) | Consistency for LLM tooling; catalogue `schema` names are kebab-case, `type` is PascalCase — they are distinct fields with distinct purposes. |
| `datacontenttype` values | Any MIME type | BSP restricts to `"application/json"` | BSP is JSON-only. Allowing other content types would require out-of-band schema negotiation the protocol does not define. |
| Extension attributes | Allowed (open `additionalProperties`) | BSP schemas use `additionalProperties: false` — extensions are blocked | Extensions would silently pass through servers that don't understand them, making it impossible to reason about what a conformant BSP message contains. Explicit fields only. |

### Implication for implementers

- Do not validate BSP messages against a CloudEvent 1.0 schema validator — they will fail on `dataschema` format and `additionalProperties`.
- Do not use CloudEvent SDK libraries that enforce spec compliance for constructing BSP messages.
- `bsp-mcp` and BSP tooling construct the envelope as documented here — not as per the CloudEvent spec.
- If you need genuine CloudEvent 1.0 compliance (e.g. for integration with a CloudEvents broker), adapt the envelope at the boundary.
