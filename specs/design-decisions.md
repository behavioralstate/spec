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

The practical implication: if a caller polls `GET /events?correlationId=...` some time after submitting a command, they receive the server's current view at that moment — which may or may not include the event they are looking for, depending on how long the server retains event history. **For reliable point-in-time delivery, use a push channel** (SSE stream or MCP notification), which fires at the moment of publication.

### How to retrieve results

The canonical retrieval path uses the correlation identifier echoed in the `201` response:

```
POST  /commands                        → 201 { "id": "abc123", "correlationId": "abc123" }
GET   /events?correlationId=abc123     → [ { "type": "CounterProposed", "correlationid": "abc123", ... } ]
```

Correlation is **first-class**: the `correlationid` envelope attribute (a CloudEvents extension, lowercase on the wire) may be set by the caller on the command — when omitted, the server adopts the command's `id` — and **must** appear on every event produced by processing that command. Follow-up commands in the same business process should propagate it, which is what lets one identifier traverse a chain of services. See [Correlation becomes first-class](#correlation-becomes-first-class).

### Polling vs push

Polling `GET /events?correlationId=...` is the fallback and the simplest path. For callers that need lower latency or want to avoid polling loops, two push channels are available:

| Channel | How declared | Best for |
|---|---|---|
| **SSE stream** | `"sse": true` in the events capability's `push` object | HTTP callers that can hold a connection open (browsers, CLIs, local agents) |
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
| `apikey` (query) | URL param, e.g. `?apikey=<key>` | IoT devices, constrained clients |
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
- **A naming recommendation** (`RegisterService` / `list-services` / `ServiceRegisteredV1`) is documented as a non-normative worked example in [Composing Commands into Processes](./composing-processes.md#worked-example-a-service-registry-with-heartbeat), for implementers who want a cross-legible service-management vocabulary.

---

## A2A Transport removed

### The decision

The A2A (Google Agent-to-Agent) transport binding has been **removed** from the protocol. BEST defines two consumer-facing transport bindings — HTTP (the baseline) and MCP. The `a2a` transport block and the `push.a2a` delivery channel are gone from the discovery manifest schema.

### Why

The binding added spec surface without adding capability. A2A is itself HTTP/JSON: an A2A-speaking agent that wants to call a BEST service can already do so through the HTTP binding, and LLM-tooling consumers are served by MCP. The A2A mapping (Agent Card ↔ manifest, Task ↔ execution trace, Message ↔ command/event) duplicated semantics the existing bindings already carry, while dragging in A2A's own task lifecycle — a coordination model BEST deliberately does not own (commands in, events out; see [Command Result Retrieval](#command-result-retrieval)).

The binding also never had an implementation or a known consumer. Keeping an untested normative surface alive costs every implementer conformance ambiguity ("do I need an Agent Card?") for zero interoperability gain. If a concrete multi-agent deployment ever needs A2A-native delivery, the binding can be reintroduced as an extension informed by that real use — the manifest's `transports` object is deliberately open to new bindings.

### What stays

- **HTTP** remains the baseline every conformant service must expose; **MCP** remains the LLM-tooling binding.
- Push delivery kept its channels (the webhook channel was itself removed later — see below).

---

## gRPC Transport removed

### The decision

The `grpc` transport block has been **removed** from the discovery manifest schema. It was declared in the schema (`endpoint` plus optional `proto`) but BEST never defined a normative gRPC binding — no request mapping, no error mapping, no conformance requirements.

### Why

The same logic that removed the A2A binding: it was spec surface with no implementation, no known consumer, and no normative content behind it. A schema field that declares a transport the spec never specifies costs implementers conformance ambiguity for zero interoperability gain. Internal runtimes that use gRPC between their own components can keep doing so — BEST only governs the consumer-facing surface, and that remains HTTP (baseline) and MCP. If a real deployment ever needs a consumer-facing gRPC binding, it can be introduced as an extension informed by that use, exactly as the A2A note prescribes.

---

## Webhook subscriptions removed

### The decision

The webhook push channel has been **removed**: `POST /subscriptions` and `DELETE /subscriptions/{id}`, the subscription schemas, the `push.webhook` flag, the service descriptor's `webhook` field, and the webhook SSRF security section. Push delivery is now SSE and MCP notifications; polling `GET /events` remains the universal fallback.

### Why

Webhooks were the most expensive unfinished surface in the spec. The `secret` field promised HMAC-signed deliveries whose signature scheme (header, algorithm, signed bytes) was never specified — so no two implementations could verify each other's deliveries. Delivery semantics (retries, ordering, at-least-once) were equally undefined, and the SSRF/DNS-rebinding requirements were the heaviest obligation in the security section. Finishing all of that properly is substantial normative work, and the feature had no known consumer: no production caller had registered a subscription.

SSE already serves push for connected consumers, and polling covers the rest. If push-to-disconnected-services is ever genuinely needed, the CNCF CloudEvents ecosystem already maintains an HTTP webhook delivery specification — as a conformant CloudEvents profile, BEST would adopt that as an extension rather than reintroduce a bespoke scheme.

---

## Correlation becomes first-class

### The decision

`correlationid` is a first-class envelope attribute — a CloudEvents extension attribute (lowercase on the wire, per CE naming rules) defined by the BEST profile. Commands **may** carry it (the server adopts the command's `id` when absent); the `201` response echoes the effective value as `correlationId`; every event produced by processing a command **must** carry it; follow-up commands in the same business process **should** propagate it. The `?correlationId=` filters on `GET /events` and `GET /events/stream` match this attribute.

### Why

Before this, the command's `id` was the correlation handle, but nothing at the protocol level carried it *on the events* — the field name inside event payloads was "agreed between client and server." That worked only when one party wrote both sides. A generic consumer polling `GET /events` had no reliable way to match events to commands, and the identifier could not survive a multi-step process spanning services: each hop minted a new command `id` and the chain broke.

Making correlation an envelope attribute fixes both without touching `data`: any consumer can correlate from the envelope alone, and because the attribute is *supplied* rather than derived, a process manager can stamp one identifier on the first command and carry it through every subsequent command and event in the chain. Keeping it out of the payload also preserves the rule that `data` is semantically opaque to the protocol. As a CloudEvents extension attribute it rides through CE SDKs, brokers, and validators unchanged, and pre-0.9.2 consumers — required to ignore unknown envelope attributes — are unaffected.

Idempotency and correlation stay separate concerns: `id` remains the idempotency key, unique per message; `correlationid` groups messages into a process.

---

## Service Metadata vs. Memory

### The decision

The service descriptor carries an optional `metadata` field — an opaque JSON object holding service-defined configuration (e.g. model name, system prompt, provider settings). The `io.best.agents.memory` capability has been **removed** from the protocol. The `GET /events` endpoint covers the remaining use case for accumulated historical state.

The descriptor is declared in the discovery manifest's `agents` array. Where a service is registered dynamically, registration uses **upsert semantics** via the `RegisterService` command (see the [registry worked example](./composing-processes.md#worked-example-a-service-registry-with-heartbeat)): submitting a registration for an existing `id` fully replaces the descriptor.

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

## CloudEvents Conformance

### The decision

BEST uses the CloudEvents 1.0 envelope as its wire format for commands and events, as a **conformant profile**: every valid BEST message is a valid CloudEvents 1.0 message. BEST restricts the envelope where its design needs consistency, but never violates the CloudEvents specification. (Earlier versions of the protocol deviated — most notably by allowing a relative `dataschema` — and documented those deviations; 0.9.0 removed them.)

### Why

CloudEvents 1.0 is a widely understood, well-structured envelope that LLM clients can read, reason about, and generate natively. Full conformance means BEST messages work unchanged with CloudEvents SDKs, brokers, and validators — no adaptation layer at the boundary — and BEST composes with the CNCF ecosystem instead of forking it. The earlier deviations turned out to be unnecessary: `source` as "any string" was already almost always a valid URI-reference, casing and JSON-only rules are legitimate profile restrictions, and the relative-`dataschema` portability argument was moot because servers validate against their own catalogue and never dereference the field anyway.

### Profile restrictions

| Field / Rule | CloudEvents 1.0 | BEST profile | Reason |
|---|---|---|---|
| `type` casing | No casing requirement | PascalCase mandated (e.g. `ProposeCounter`) | Consistency for LLM tooling; catalogue `schema` names are kebab-case, `type` is PascalCase — distinct fields with distinct purposes. |
| `datacontenttype` | Any media type | `"application/json"` only | BEST is JSON-only. Other content types would require out-of-band schema negotiation the protocol does not define. |
| `dataschema` presence | Optional | Required for commands; optional for events | Commands are validated before queuing; untyped events are a supported pattern. |
| `dataschema` value | Absolute URI | The catalogue entry's absolute URI (resolves to `GET /commands/{schema}/{version}`) | One canonical value; servers still validate from their **own** catalogue and **never fetch** the caller-supplied URI (SSRF — see [Security](/specs/security#command-ingestion-schema-selection)). |
| `source` | URI-reference, absolute recommended | Same, with an added rule: never treated as authenticated identity | Caller-declared origin; authorisation derives from credentials, not `source`. |
| Extension attributes | Producers may add them | Permitted; BEST defines one (`correlationid`, since 0.9.2) and messages must not rely on others | Consumers **must** ignore unknown attributes rather than reject — this also implements BEST's forward-compatibility rule (see [Versioning](/specs/versioning)). |

### Implication for implementers

- BEST messages may be validated with CloudEvents 1.0 validators and constructed with CloudEvents SDKs.
- Servers validate command payloads against their **own** catalogue schema, selected by `type` or by the schema name `dataschema` carries; the wire `dataschema` is a selector, never fetched.
- Consumers and servers must tolerate unknown envelope attributes (ignore, don't reject).
- CloudEvents broker integration requires no envelope adaptation.

---

## Manifest Extensions — one escape hatch, domain-first

### The decision

Since 0.9.7 the manifest root and each capability entry accept one optional free-form `extensions` object — the single lawful home for vendor-defined data in a manifest that is otherwise strictly closed (`additionalProperties: false` everywhere). Keys are reverse-domain identifiers owned by the declarer; the core never interprets the contents; consumers ignore what they don't understand; no extension may be required to use a core capability.

The rule that governs it is **domain-first**: anything dynamic, behavioral, or obtainable after authentication **must** be modeled as ordinary capability surface — a custom capability, a query, an event, a workflow. `extensions` exists only for static, discovery-time declarations that must ride in the manifest document itself.

### Why

The strict schema is a feature — it keeps the core contract unambiguous — but it left vendor data with literally no legal position in the document: every extra key, useful or leftover, was equally non-conformant. The first casualty was real (a deployment's leftover per-capability configuration failing validation with nowhere to migrate to).

The obvious fix — open the whole manifest up — would dissolve the contract. The obvious alternative — model everything as domain surface — is BEST's own philosophy (it is why registry, lifecycle, and memory were deleted) and covers almost everything… except the narrow class of facts a consumer needs *before* it can interact at all: data an unauthenticated indexer reads while classifying hosts, integrity data that must cover the manifest document itself, or a static annotation on a specific manifest element. A query cannot serve those, because reaching a query already presumes the manifest was read, trusted, and credentials obtained.

So the escape hatch is exactly as large as that residue and no larger. It also gives external standardization efforts (e.g. IETF discovery work on attestation, capacity, or risk metadata) a compatibility path: such data enters as a namespaced extension, and is promoted into the core only if a standard defines it.

### What this is not

- Not a side-channel API — dynamic data behind `extensions` instead of a query is a design error.
- Not a private channel — the root manifest is public, and the manifest-hygiene rule applies to extension content identically.
- Not a second capability mechanism — behavior is declared as a capability, never as an extension.
