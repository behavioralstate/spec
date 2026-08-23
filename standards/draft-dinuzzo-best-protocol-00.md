---
###
# Internet-Draft for the BEST protocol, in kramdown-rfc format.
# Build: gem install kramdown-rfc && kdrfc draft-best-protocol-00.md
# Submit: https://datatracker.ietf.org/submit/ (free account), then email the
# Independent Submissions Editor per https://www.rfc-editor.org/about/independent/
#
# Before submission:
#   - run a requirements-language pass: every MUST/SHOULD/MAY intentional, RFC 8174 style
#   - kdrfc build must be warning-free
###
title: "BEST: The Behavioral State Protocol"
abbrev: "BEST"
docname: draft-dinuzzo-best-protocol-00
category: info
submissiontype: independent
ipr: trust200902
area: ""
workgroup: ""
keyword:
  - CQRS
  - CloudEvents
  - discovery
  - agent interoperability
author:
  - name: Riccardo Di Nuzzo
    ins: R. Di Nuzzo
    email: riccardo@dinuzzo.it
normative:
  RFC3986:
  RFC6570:
  RFC8174:
  RFC8615:
  CLOUDEVENTS:
    title: "CloudEvents - Version 1.0.2"
    author:
      - org: Cloud Native Computing Foundation
    target: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
  JSONSCHEMA:
    title: "JSON Schema: A Media Type for Describing JSON Documents (draft 2020-12)"
    target: https://json-schema.org/draft/2020-12/json-schema-core
informative:
  RFC7942:
  MCP:
    title: "Model Context Protocol"
    target: https://modelcontextprotocol.io/
  BESTSPEC:
    title: "BEST - Behavioral State Protocol (living specification)"
    target: https://behavioralstate.io/
---

--- abstract

The Behavioral State Protocol (BEST) defines a discovery-first, behaviour-oriented interaction surface for domain services: the commands a service accepts, the events it publishes, and optionally the queries it answers. Services self-describe through a manifest at the well-known URI "/.well-known/best"; messages use a conformant profile of the CloudEvents 1.0 envelope described by JSON Schema. BEST deliberately specifies only the interaction surface -- never a service's internal architecture, storage, or execution model -- allowing independent implementations across any runtime, language, or transport to interoperate without bespoke integration.

--- middle

# Introduction

When an organisation operates multiple autonomous callers -- AI agents, process managers, integrations -- against heterogeneous systems, each pairing of caller and system tends to require a bespoke integration: the caller must be told, out of band, which operations the system accepts, what the payloads look like, how results are delivered, and how to associate a result with the request that caused it.

Command Query Responsibility Segregation (CQRS) provides the underlying semantics BEST builds on: writes are expressed as commands, and the results of processing are recorded as events. What CQRS does not provide is a common, machine-readable way for a caller to discover a service's command surface, observe its events, and correlate outcomes, without reading documentation or source code.

BEST fills this gap with four elements:

1. A discovery manifest at the well-known URI "/.well-known/best" describing the service's capabilities, transports, and authentication requirements.

2. A single command-ingestion entry point, "POST /commands", routed by the message "type" attribute rather than by URL structure.

3. A queryable event log, "GET /events", plus optional push delivery, through which the immutable facts produced by processing are observed; a first-class correlation identifier ties each event to the command that caused it.

4. An optional synchronous read surface, "GET /queries/{schema}", for reading current state before issuing a command.

BEST is deliberately not REST: there are no resources to manipulate and no CRUD verb semantics. Callers invoke named operations (commands such as "ProposeCounter" or "SubmitOrder") and observe the facts that result (events such as "CounterProposed"). Resource-oriented endpoints remain valid parts of a service's own API but are outside BEST's scope.

The protocol's design principles are: protocol-first (the specification defines the surface; implementations derive from it); compose, don't invent (the envelope is a CloudEvents profile {{CLOUDEVENTS}}, contracts are JSON Schema {{JSONSCHEMA}}, discovery uses a well-known URI {{RFC8615}}, tenancy uses URI templates {{RFC6570}}); discoverable by default; transport-agnostic; modular (implementers expose only the capabilities they support); and implementation-agnostic (no prescribed language, framework, storage, or execution model -- a BEST service can equally be an AI agent, a deterministic backend, a sensor, or a human-operated workflow).

This document specifies the protocol as released in version 0.9.2 of the living specification {{BESTSPEC}}.

## Conventions and Definitions

{::boilerplate bcp14-tagged}

Service:
: A BEST-compliant domain service that accepts commands and publishes events.

Command:
: An intent to change the system, sent to a service by any caller.

Event:
: An immutable domain fact published by a service as the result of processing.

Query:
: A synchronous read of current state (optional capability).

Manifest:
: The JSON document served at "/.well-known/best" describing a service's capabilities, transports, and authentication requirements.

Capability:
: A named, composable unit of protocol surface declared in the manifest. Names use reverse-domain notation; the "io.best." prefix is reserved for this specification.

Correlation identifier:
: The value of the "correlationid" envelope attribute: the identifier that ties a command to the events its processing produces, across an arbitrarily long chain of commands and events.

# Message Envelope

BEST messages are CloudEvents {{CLOUDEVENTS}}: every valid BEST message is a valid CloudEvents 1.0 message, so CloudEvents SDKs, brokers, and validators process BEST traffic unchanged. BEST is a profile that restricts and extends the envelope as follows: the "type" attribute MUST be PascalCase; "datacontenttype" MUST be "application/json"; "dataschema" MUST be present on commands (it MAY be absent on events, which are then untyped); one extension attribute, "correlationid", is defined; and consumers MUST ignore unknown envelope attributes rather than reject messages carrying them.

| Attribute | Commands | Events | Description |
|---|---|---|---|
| specversion | required | required | Always "1.0". |
| id | required | required | Unique message identifier (UUID recommended), unique within the scope of "source". For commands this is the idempotency key. |
| source | required | required | URI-reference {{RFC3986}} identifying the origin of the message. An absolute URI is recommended; a relative reference (a service name or routing key) is valid. Caller-declared; never treated as authenticated identity (see Security Considerations). |
| type | required | required | Message type in PascalCase (e.g. "ProposeCounter", "CounterProposed"). For commands, this MUST match a type in the command catalogue; it is the routing key. |
| datacontenttype | required | required | Always "application/json". |
| dataschema | required | optional | Absolute URI of the JSON Schema for "data". For commands, the catalogue's "dataschema" value. Events without "dataschema" are untyped: the consumer interprets "data". |
| correlationid | optional | conditional | Extension attribute carrying the correlation identifier (see {{correlation}}). Lowercase on the wire, per CloudEvents attribute-naming rules. |
| time | required | required | Timestamp of message creation (RFC 3339). |
| data | required | required | The domain payload. For commands, validated against the catalogue schema before queuing. For events, semantically opaque to the protocol. |
{: title="BEST envelope attributes"}

An example command and the event its processing produced:

~~~
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema":
    "https://api.example.com/commands/propose-counter/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": { "salary": 100000, "startDate": "2025-09-01" }
}
~~~

~~~
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema":
    "https://api.example.com/events/counter-proposed/1.0",
  "correlationid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "time": "2025-07-01T10:30:01Z",
  "data": { "salary": 100000, "startDate": "2025-09-01",
            "contractId": "contract-42" }
}
~~~

# Discovery

Every BEST endpoint serves a manifest at the well-known URI "/.well-known/best" ({{RFC8615}}) with media type "application/json", over HTTPS. This resource MUST be retrievable without authentication; every other endpoint MAY require the credentials declared in the manifest's "authentication" object. The path is canonical; consumers MUST NOT assume a ".json" file extension.

The manifest root is a single "best" object:

~~~
{
  "best": {
    "version": "0.9.2",
    "authentication": { ... },
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
~~~

version (required):
: The protocol version implemented, as MAJOR.MINOR.PATCH.

services (required):
: An object mapping service keys to service definitions. Each service declares "version" and "description" and one or more transport bindings: "http" (the baseline -- its "endpoint" is the consumer-facing base URL to which all capability paths are appended) and optionally "mcp" (see {{transports}}). Multiple transports expose the same capability surface; they are alternative access methods, never separate operation sets.

capabilities (required):
: An array of capability entries. Each carries "name" (reverse-domain identifier), "version", "description", "spec" and "schema" URLs (required for "io.best." capabilities; optional for custom ones), an optional "service" key naming the implementing service when the capability name prefix does not match it, an optional machine-readable "endpoints" array of { method, path } pairs appended to the service's "http.endpoint", an optional "status", and -- on the events capability -- an optional "push" object declaring supported push channels ("sse", "mcp").

authentication (optional):
: Credential requirements for every endpoint other than the manifest itself: "type" ("none", "bearer", "apiKey", or "oauth2") plus, per type, "scheme", "in", "scopes", "tokenUrl", and a "docs" URL. Consumers MUST read this object before calling any other endpoint. Hosts requiring credentials SHOULD set "docs" to an onboarding page.

tenants (optional):
: Multi-tenant discovery (see {{multitenancy}}).

agents (optional):
: A snapshot of service descriptors hosted by the endpoint: each descriptor carries "id", "name", "accepts" and "produces" (PascalCase event type strings), "status" ("running", "paused", "stopped", or "error"), and optional opaque "metadata". This array is a discovery hint, not a live directory; BEST defines no registry endpoint. Implementations that manage services dynamically expose that as an ordinary domain (commands and queries) under their own namespace.

Capability status semantics: "active" (the default) means every required endpoint exists and is callable; declaring "active" while returning 404 or 501 on a required route is a conformance violation. "partial" means a subset is implemented, which MUST be documented in the "endpoints" array. "planned" means nothing is callable yet.

Individual command types are domain data, not capabilities: a specific type such as "ProposeCounter" MUST NOT appear as a manifest capability entry. The capability declares the command surface; the types are discovered at runtime via "GET /commands".

## Multi-Tenancy {#multitenancy}

A tenant identifier in BEST is an opaque string scoping a manifest to a context -- a customer account, a user, a workspace, or the platform's own administrative context. Multi-tenancy applies when callers operate in isolated data scopes, even when every tenant shares an identical capability surface.

The root manifest of a multi-tenant host declares a URI template ({{RFC6570}}):

~~~
"tenants": {
  "manifest": "https://api.example.com/.well-known/best/{tenantId}"
}
~~~

The following rules apply:

1. "{tenantId}" is the only permitted template variable. The root manifest MUST include "tenants.manifest" if tenant-scoped capabilities exist, and MUST NOT declare tenant-scoped capabilities itself; they appear only in tenant manifests. Root-level capabilities the host can fulfil without tenant context MAY remain.

2. The expanded URI returns a fully self-contained tenant manifest: its "http.endpoint" is pre-scoped, every "dataschema" URI is fully resolved, no "{tenantId}" placeholder appears anywhere, and it carries no "tenants" object of its own. Consumers treat it exactly as a single-tenant manifest.

3. Fetching the tenant manifest requires at most the credential declared in the root "authentication" object -- never a tenant identifier header, since the path already carries it.

4. URI templating is valid only in "tenants.manifest". Everywhere else in the protocol, URIs MUST be fully resolved.

# Commands

Commands are intents to change a domain service. The service validates, queues, and processes them asynchronously; results surface as events ({{events}}).

| Method | Path | Description |
|---|---|---|
| GET | /commands | Command catalogue: all accepted command types with schema URIs |
| POST | /commands | Send a command (BEST envelope); validates, queues, returns 201 |
| GET | /commands/{schema}/{version} | JSON Schema document for one command type and version |
{: title="Command endpoints"}

## Catalogue

"GET /commands" returns the list of command types the service accepts. Each entry carries "schema" (a kebab-case name used as the "{schema}" path segment; distinct from the PascalCase envelope "type", of which it is typically the kebab-case form), "version", "dataschema" (a resolvable URI that is the exact value to place on a command envelope, resolving to "GET /commands/{schema}/{version}" on the same surface), and an optional "description".

The schema document returned by "GET /commands/{schema}/{version}" has media type "application/schema+json". It MAY declare a "produces" array of PascalCase event types the command can raise (e.g. ["CounterProposed", "NegotiationFailed"]). Failure outcomes are ordinary events in that list; naming conventions such as a "Failed" suffix are service-defined. BEST defines no timeout protocol: services SHOULD document expected processing times and SHOULD always publish a failure event rather than silently dropping a command; callers decide how long to wait.

## Ingestion Semantics

"POST /commands" processing proceeds as follows:

1. Validate that the required envelope attributes are present.

2. Look up the validation schema in the server's own catalogue, keyed by a server-owned identifier (the "type", or the schema name carried in "dataschema"). The inbound "dataschema" value is a selector, not a location: servers MUST NOT fetch a caller-supplied "dataschema" URI (see Security Considerations). Schema selection, authorisation, and dispatch MUST key on the same identifier.

3. Validate "data" against that schema.

4. If valid, durably queue the command and return 201 with a JSON body carrying "id" (the command's envelope id) and "correlationId" (the effective correlation identifier, {{correlation}}). If invalid, return 400.

The envelope "id" is an idempotency key: servers MUST detect duplicate submissions (same "id" and authenticated source) within a retention window, and a reused "id" with a different payload MUST be rejected with 409. The "type" attribute is the routing key; "source" MUST NOT be the sole routing key.

201 signals that the command was durably recorded and processing will happen. A server that cannot durably enqueue before responding MAY return 202 instead, which carries no durability guarantee.

## Correlation {#correlation}

BEST defines no synchronous command response; the result of processing is one or more published events, tied to the command by the "correlationid" envelope attribute.

The caller MAY set "correlationid" on a command; when it is absent, the server adopts the command's "id" as the correlation identifier. In both cases the 201 response echoes the effective value as "correlationId". Every event produced by processing the command MUST carry that identifier in its "correlationid" attribute, so any consumer -- including one that never saw the command -- can match events to their originating submission. Events not caused by a command MAY omit the attribute.

In a multi-step process, a follow-up command issued in reaction to an event SHOULD carry the same "correlationid", allowing one identifier to traverse a chain of commands and events across services. Correlation and idempotency are separate concerns: "id" remains unique per message, while "correlationid" groups messages into a process.

~~~
POST /commands                    -> 201 { "id": "abc123",
                                          "correlationId": "abc123" }
GET  /events?correlationId=abc123        -> what has already happened
GET  /events/stream?correlationId=abc123 -> what happens next (push)
~~~

# Events {#events}

Events are immutable facts published as the result of processing.

| Method | Path | Description |
|---|---|---|
| GET | /events | Historical query: paginated, filterable log of past events; may double as the event catalogue |
| GET | /events/stream | Live stream (Server-Sent Events): events produced after the connection opens |
| GET | /events/{schema}/{version} | JSON Schema document for one event type and version |
{: title="Event endpoints"}

"GET /events" and "GET /events/stream" are complementary: a caller loads history first, then opens the stream.

An event with "dataschema" is typed: consumers can fetch the schema and validate. Without it, the event is untyped and the consumer interprets "data"; the envelope ("type", "source", "id", "correlationid", "time") still supports routing and correlation. Both patterns can coexist in one service.

BEST makes no replay guarantee: "GET /events" returns whatever the server currently exposes -- a full log, a recent window, or a view of domain records mapped to the event shape at query time. Clients MUST NOT assume completeness, ordering, or replay fidelity. For reliable point-in-time delivery, callers use a push channel.

## Historical Query

Query parameters on "GET /events", all optional and combinable: "type" (filter by envelope type), "correlationId" (only events whose "correlationid" attribute matches), "source", "from" and "to" (RFC 3339 time-range bounds, inclusive), "limit", and "after" (an opaque pagination cursor from a previous response's "nextCursor"). Responses are an object with an "events" array and, when further pages exist, a "nextCursor" string.

"GET /events" MAY additionally serve catalogue entries mirroring the command catalogue: "schema", "version", optional "dataschema" (omitted for untyped events), and "description", which for untyped events is the primary documentation.

## Live Stream

"GET /events/stream" is requested with "Accept: text/event-stream" plus credentials; optional filters are "correlationId", "type", and "source". Each event arrives as an SSE "data" field containing the envelope JSON, with the envelope "id" echoed as the SSE event id. On reconnection, clients send "Last-Event-ID" and the server replays anything produced after it. Servers SHOULD send keepalive comments and MAY close the stream after inactivity or a terminal event; clients MUST handle reconnection and MUST NOT assume the stream is lossless.

## Delivery Channels

The events capability declares its push channels in the manifest's "push" object. Browser applications, command-line tools, and local agents use SSE; LLM clients with an active MCP session use MCP server-to-client notifications ({{transports}}); every other caller polls "GET /events", which is always available.

# Queries

Queries are synchronous reads of current state -- the read-before-write complement to commands (for example, an agent lists broker accounts before referencing one in a command). The capability is optional and declared in the manifest like any other.

| Method | Path | Description |
|---|---|---|
| GET | /queries | Query catalogue: same entry shape as the command catalogue |
| GET | /queries/{schema}/{version} | Query schema document |
| GET | /queries/{schema} | Execute: parameters as query string; returns 200 with the result body |
{: title="Query endpoints"}

The query schema document has up to three sections: "description", "parameters" (a JSON Schema for accepted query-string parameters, omitted when the query takes none), and "response" (a JSON Schema for the result body; required). Execution returns 400 for missing or invalid parameters and 404 for an unknown schema name.

Queries are not a query language (no filter expressions, joins, or aggregations), not a REST resource hierarchy (no per-item paths), and not event sourcing (they return current state as the service projects it; historical facts live in "GET /events").

# Transports {#transports}

HTTP is the baseline transport: every conformant service exposes it. All requests and responses are "application/json" (schema documents are "application/schema+json"; the event stream is "text/event-stream").

Every capability path is appended to the service's "http.endpoint"; the leading slash is a separator, not a root-relative indicator. For example, with "http.endpoint" of "https://api.example.com/tenants/acme", the path "/commands" resolves to "https://api.example.com/tenants/acme/commands". The "http.endpoint" value MUST be the consumer-facing public address, never an internal backend or service-mesh URL.

Authentication follows the manifest's "authentication" object: "bearer" maps to "Authorization: Bearer" credentials; "apiKey" to a header or query parameter named by the declaration. Every endpoint except "GET /.well-known/best" requires credentials when they are declared.

All error responses use a consistent body:

~~~
{ "error": { "code": "SCHEMA_NOT_FOUND",
             "message": "Unknown command schema 'foo'",
             "details": {} } }
~~~

| Status | Meaning |
|---|---|
| 200 | Success with body (queries, event lists, catalogues, schema documents) |
| 201 | Command accepted and durably queued |
| 202 | Accepted without durability guarantee |
| 400 | Invalid request body or parameters (schema validation failure) |
| 401 | Missing or invalid credentials (only when authentication is declared) |
| 404 | Unknown route, schema name, or version |
| 409 | Duplicate command "id" with a different payload |
| 413 | Request body exceeds server limits |
| 422 | Semantic error (capability not supported) |
| 500 | Internal error |
{: title="HTTP status codes"}

A Model Context Protocol {{MCP}} binding MAY additionally be declared in a service's "mcp" transport object ("transport", "server", optional "push" and a transport-scoped "authentication" object). Every MCP tool wraps exactly one HTTP endpoint; the binding exposes the same logical capability surface to LLM tooling that cannot call HTTP APIs directly. When "push" is true, the server MAY deliver events as MCP server-to-client notifications, matched by correlation identifier.

# Conformance

A BEST-compliant endpoint MUST:

1. Expose "GET /.well-known/best" returning a valid manifest: status 200, publicly retrievable, "application/json".

2. Include at least one service in the manifest.

3. List all supported capabilities with valid schema URLs.

4. Implement the HTTP surface for every listed capability.

5. Return valid JSON conforming to the referenced schemas.

6. Use the status codes and error format of {{transports}}.

7. Declare authentication in the manifest, or omit the declaration for public endpoints; an undocumented 401 is non-conformant.

Per-capability required endpoints, for capabilities declared "active" ("partial" capabilities are exempt but MUST document their available routes in "endpoints"):

| Capability | Required endpoints |
|---|---|
| io.best.agents.commands | GET /commands, POST /commands |
| io.best.agents.events | GET /events |
| io.best.agents.queries | GET /queries, GET /queries/{schema}/{version}, GET /queries/{schema} |
{: title="Required endpoints per capability"}

Multi-tenant root manifests additionally follow the rules of {{multitenancy}}.

Conformance does not require any specific language, framework, or architecture; any specific event transport; MCP support; or AI capabilities -- a BEST service can be deterministic or human-operated.

Versioning is semantic (MAJOR.MINOR.PATCH) at the manifest root, per service, and per capability. Consumers MUST ignore unknown fields for forward compatibility. All BEST identifiers use reverse-domain notation; the "io.best." prefix is reserved for this specification.

This document establishes no new IANA registries (see IANA Considerations).

# Implementation Status

This section records the implementation status at the time of writing, per {{RFC7942}}; it is to be removed by the RFC Editor before publication.

Two production deployments of BEST exist -- dotquant.io (fintech trading platform) and remundo.com (business platform) -- implemented as separate codebases by the specification's author, each exposing discovery, commands, events, and queries over the HTTP binding. A generic reference MCP server (@behavioralstate/best-mcp, npm) adapts any BEST endpoint for MCP-capable LLM clients, and a conformance validator (@behavioralstate/best-validate, npm) executes this document's conformance checklist against a live endpoint. No implementation independent of the specification author is known yet.

# Security Considerations

TLS:
: Production endpoints MUST be served over HTTPS; MCP transports MUST provide TLS-equivalent confidentiality. Clients MUST validate certificates and MUST NOT send credentials over insecure transports.

Authentication surface:
: "GET /.well-known/best" is the only endpoint defined as unauthenticated. "GET /events" MUST require authentication and tenant-scoped authorisation unless a stream is explicitly designated public. Distinct read and write scopes are RECOMMENDED. Because "POST /commands" is a single endpoint through which every named operation is invoked, coarse scopes are insufficient on their own: servers SHOULD enforce per-command authorisation policies per credential, evaluated deny-by-default on every submission.

Schema-selection SSRF:
: Servers select validation schemas from their own catalogue, keyed by a server-owned identifier. Servers MUST NOT fetch a caller-supplied "dataschema" URI: a caller-controlled fetch is a server-side request forgery vector. Servers SHOULD reject commands whose "dataschema" does not match a catalogue entry.

Replay protection:
: The envelope "id" is an idempotency key. Servers MUST reject duplicates within a retention window, scoped to the authenticated tenant or sender; a reused "id" with a different payload MUST return 409.

Untrusted "source":
: The "source" attribute is caller-declared. Servers MUST NOT grant permissions or make security decisions from it, and SHOULD either overwrite it with the verified principal for audit purposes or record both values. Payload fields naming a principal likewise carry no authority.

Tenant isolation:
: Tenant context MUST derive from authenticated identity, never from caller-supplied paths, parameters, or payload fields. Caches, deduplication stores, and event streams MUST be isolated per tenant; knowledge of another tenant's identifier grants nothing.

Input limits:
: Servers MUST bound request body size (returning 413), JSON nesting depth, collection sizes, string lengths, and attribute counts, and SHOULD rate-limit per authenticated client and per tenant.

Manifest content:
: The manifest is publicly retrievable by design. Its content MUST be limited to information intended for unauthenticated disclosure: no internal addresses, credential material, or sensitive integration names.

Credential passthrough:
: Intermediaries such as MCP servers or gateways forward caller credentials. Passthrough MUST be opt-in per connection and off by default, credentials MUST be forwarded only to the configured endpoint and never logged, explicit per-request credentials take precedence over ambient ones, and multi-user intermediaries SHOULD fail closed.

# IANA Considerations

IANA is requested to update the existing provisional registration of the "best" well-known URI suffix in the "Well-Known URIs" registry {{RFC8615}} to permanent, with this document as the specification reference:

URI suffix:
: best

Change controller:
: Riccardo Di Nuzzo (riccardo@dinuzzo.it)

Specification document:
: this document

Status:
: permanent

This document establishes no new registries.

--- back

# Acknowledgments
{:numbered="false"}

The BEST envelope is a profile of CloudEvents, and the protocol's discovery model follows the well-known URI convention of RFC 8615; the author thanks the communities behind both. Feedback from the operators of the early production deployments shaped the correlation, multi-tenancy, and authorisation requirements in this document.
