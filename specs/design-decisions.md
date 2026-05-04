# Design Decisions

This page documents the reasoning behind key OAP design choices. It is aimed at implementers who want to understand *why* the protocol is shaped the way it is, and at contributors evaluating future changes.

---

## Command Result Retrieval

### The decision

OAP does not define a synchronous response to a command. `POST /commands` returns `201 Created` to confirm the command was accepted and queued — not that it was processed. The result of processing is one or more domain events, retrieved separately.

### Why

Commands are **intents to change** a domain service. In CQRS, the write side accepts commands asynchronously and decouples them from the read side. Returning the processing result synchronously in the `POST /commands` response would couple the caller to the service's internal processing time and force a blocking API — which conflicts with this decoupled model.

The result of processing is a **published domain event** — an immutable fact that something happened, exposed via `GET /events`. This is a *notification* that the caller can observe. It is not an Event Sourcing replay mechanism.

> **Event Sourcing is an internal server pattern, not a client capability.** A service *may* use Event Sourcing internally — storing state as a replayable log of events. But clients do not get Event Sourcing semantics. `GET /events` returns whatever the server currently exposes from its event log at the time of the query. That might be a full historical log, a recent window, or a current-state view mapped to the OAP event shape (the protocol explicitly allows any of these). Clients cannot assume they can reconstruct state by replaying events from `GET /events` — the endpoint does not guarantee completeness, ordering, or replay fidelity.

The practical implication: if a caller polls `GET /events?correlationId=...` some time after submitting a command, they receive the server's current view at that moment — which may or may not include the event they are looking for, depending on how long the server retains event history. **For reliable point-in-time delivery, use a push channel** (webhook, MCP notification, or A2A message), which fires at the moment of publication.

### How to retrieve results

The canonical retrieval path uses the correlation identifier returned in the `201` response:

```
POST  /commands                        → 201 { "id": "abc123" }
GET   /events?correlationId=abc123     → [ { "type": "CounterProposed", ... } ]
```

The `id` in the `201` response is the **correlation identifier** — it is the command's CloudEvent `id`, echoed back so callers can match incoming events to their command. The field name used inside an event payload to carry this identifier is agreed between client and server; OAP does not mandate it.

### Polling vs push

Polling `GET /events?correlationId=...` is the fallback and the simplest path. For callers that need lower latency or want to avoid polling loops, three push channels are available:

| Channel | How declared | Best for |
|---|---|---|
| **Webhook** | `webhook.url` on service descriptor at `POST /services` | REST clients running their own HTTP server |
| **MCP notification** | `"push": true` on `mcp` transport block | LLM tooling with an active MCP session |
| **A2A message** | implicit when A2A transport is active | Agent-to-agent coordination |

The service declares which push channels it supports in the `io.oap.agents.events` capability's `push` object. Callers should check this before choosing a channel.

### Timeout and silent failures

OAP does not define a timeout protocol. If a service processes a command but produces no event (a silent failure), the caller is responsible for deciding how long to wait before treating the operation as failed. Services **should** document their expected processing times and always produce a failure event (e.g. `NegotiationFailed`, `OrderRejected`) rather than silently dropping a command.

---

## Observability and Distributed Tracing

### The decision

OAP does not define a tracing capability. The protocol surface is: commands in, events out. What happens inside a service — how long each step took, which internal components were involved, what reasoning was applied — is the service's own concern.

### Why

A tracing capability that the protocol owns would need to answer: "what happened when service X processed command Y?" The answer is almost entirely implementation-specific. One service might be a Python ML pipeline; another might be a human-in-the-loop workflow; another might be a CQRS aggregate with event sourcing. There is no protocol-level trace shape that fits all of these without either being uselessly generic or encoding implementation assumptions.

More importantly, the OAP interaction surface already provides the observable facts a caller cares about:
- **What went in**: the command (callers sent it, so they already have it)
- **What came out**: the events (`GET /events?correlationId=...`)
- **Whether it succeeded**: absence of a success event after timeout, or presence of a failure event

Anything deeper than this — step duration, internal reasoning, span trees — is **platform observability**, not protocol observability.

### Using OpenTelemetry for deep tracing

For services and callers that need distributed tracing across the OAP boundary, use **OpenTelemetry** with [W3C TraceContext](https://www.w3.org/TR/trace-context/) header propagation.

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

OAP-compliant services **should** propagate the `traceparent` and `tracestate` headers from the incoming command request into any internal processing spans and into any outbound HTTP calls they make during command processing. This is standard OpenTelemetry HTTP instrumentation — most frameworks handle it automatically.

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

This is optional and orthogonal to OAP. A service that includes `traceparent` on events is not more or less OAP-compliant — it is simply more instrumented.

#### Summary

| Concern | Owner | Tool |
|---|---|---|
| What command was sent | Caller | CloudEvent `id` + `POST /commands` |
| What events came out | Caller | `GET /events?correlationId=...` |
| End-to-end latency across services | Platform | OpenTelemetry + W3C TraceContext |
| Internal step timing and spans | Service | OpenTelemetry service instrumentation |
| Distributed trace tree | Platform | OpenTelemetry collector + backend (Jaeger, Tempo, etc.) |

OAP tells you *what* happened. OpenTelemetry tells you *how* and *when* it happened across a distributed system. They are complementary, not competing.

---

## CloudEvent Deviations

### The decision

OAP uses the CloudEvent 1.0 envelope as its wire format for commands and events, but **does not conform to the CloudEvent 1.0 specification**. OAP borrows the shape — eight well-known fields that LLMs and tooling already understand — without committing to full spec compliance.

### Why

CloudEvent 1.0 is a widely understood, well-structured envelope that LLM clients can read, reason about, and generate natively. Using it means OAP messages are immediately recognisable and usable by existing tooling without custom parsing. However, some CloudEvent rules conflict with OAP's design goals — particularly around `source` routing, relative `dataschema` URIs, and the extension attribute model. Rather than bending OAP's design to fit the spec, we adopt the shape and document the deviations explicitly.

### Deviations

| Field / Rule | CloudEvent 1.0 | OAP behaviour | Reason |
|---|---|---|---|
| `dataschema` format | Must be an absolute URI | OAP uses a relative URI: `{schema}/{version}` (e.g. `configure-broker/1.0`). Absolute URIs appear in catalogue entries but not necessarily on the wire. | Relative URIs are portable across environments (dev, staging, prod) without requiring callers to know the host. The server resolves to its own catalogue — a caller-supplied absolute URI would create an SSRF risk. |
| `source` semantics | Should be a URI identifying the origin | OAP allows any string — URI, routing key, label, or any identifier meaningful to the implementation | `source` has proven useful as a lightweight routing key in multi-tenant backends. Forcing URI format adds no protocol value. |
| `type` casing | No casing requirement | OAP mandates PascalCase (e.g. `ProposeCounter`) | Consistency for LLM tooling; catalogue `schema` names are kebab-case, `type` is PascalCase — they are distinct fields with distinct purposes. |
| `datacontenttype` values | Any MIME type | OAP restricts to `"application/json"` | OAP is JSON-only. Allowing other content types would require out-of-band schema negotiation the protocol does not define. |
| Extension attributes | Allowed (open `additionalProperties`) | OAP schemas use `additionalProperties: false` — extensions are blocked | Extensions would silently pass through servers that don't understand them, making it impossible to reason about what a conformant OAP message contains. Explicit fields only. |

### Implication for implementers

- Do not validate OAP messages against a CloudEvent 1.0 schema validator — they will fail on `dataschema` format and `additionalProperties`.
- Do not use CloudEvent SDK libraries that enforce spec compliance for constructing OAP messages.
- `oap-mcp` and OAP tooling construct the envelope as documented here — not as per the CloudEvent spec.
- If you need genuine CloudEvent 1.0 compliance (e.g. for integration with a CloudEvents broker), adapt the envelope at the boundary.
