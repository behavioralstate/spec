---
###
# Internet-Draft for the BEST protocol, in kramdown-rfc format.
# Build, with no local tooling, through the IETF Author Tools API:
#   curl -sS -F file=@draft-dinuzzo-best-protocol-02.md \
#     https://author-tools.ietf.org/api/render/xml -o draft-dinuzzo-best-protocol-02.xml
#   curl -sS -F file=@draft-dinuzzo-best-protocol-02.xml \
#     https://author-tools.ietf.org/api/render/text -o draft-dinuzzo-best-protocol-02.txt
#   curl -sS -F file=@draft-dinuzzo-best-protocol-02.xml \
#     https://author-tools.ietf.org/api/validate
# The validation must report no errors and no idnits flaws.
# Or locally: gem install kramdown-rfc && kdrfc draft-dinuzzo-best-protocol-02.md
# Submit: https://datatracker.ietf.org/submit/ (free account). The document
# date is the render date; the datatracker accepts it within three days.
#
# -02 changes over -01: spec snapshot updated 0.9.6 -> 0.9.19.
#   - Discovery: Origin Discovery, with the manifest as the only entry and
#     what a site shows the person (0.9.11, 0.9.12); Name Resolution, a DNS
#     name as the whole namespace, with a TXT fallback and the resolver's
#     obligations (0.9.10, 0.9.15, 0.9.17); the "extensions" object under a
#     domain-first rule (0.9.7); surfaces with different access through a
#     per-service "authentication" block (0.9.11); Manifest Discipline
#     (0.9.11); Multi-Tenancy rules 5 and 6 (0.9.11, 0.9.16, 0.9.18).
#   - Authentication: token exchange for header-constrained clients
#     (RFC 6749, RFC 6750) (0.9.8); agent registration through RFC 8628,
#     with the connection name, the credential block and errors per
#     RFC 6749 Section 5.2 (0.9.11 to 0.9.18); the sign-in guidance, carried
#     verbatim (0.9.14, 0.9.15, 0.9.17); identity and registration as a
#     described pattern (0.9.11).
#   - Commands: "commandType"; the "commitment" and "access" impact
#     categories (0.9.11); refusal at ingest for the service's current
#     state, idempotency scoped to the sending credential, processing across
#     a restart, a correlation id owned by its first sender and carried on
#     every later fact (0.9.18).
#   - Events and queries: no event catalogue, an unknown Last-Event-ID, RFC
#     3339 range bounds, a query's "parameters" schema governing what it
#     accepts; a workflows capability "active" only with a recipe (0.9.18).
#   - HTTP: the CloudEvents structured content mode (0.9.11); 415 and 429.
#   - Conformance items 6 and 8 to 13, and obligations marked "Required
#     from 0.10.0".
#   - Security Considerations: cleartext only on loopback or a hop stated
#     encrypted; public surfaces and the registration endpoints;
#     identifiers are not secrets; credentials stay out of transcripts; the
#     person approves in their own browser; query-string credentials;
#     request records; pacing and event-stream bounds (0.9.8 to 0.9.18).
#   - Implementation Status updated, with the first independent
#     implementation, in progress.
###
title: "BEST: The Behavioral State Protocol"
abbrev: "BEST"
docname: draft-dinuzzo-best-protocol-02
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
  RFC1035:
  RFC3339:
  RFC3986:
  RFC5890:
  RFC6570:
  RFC6749:
  RFC6750:
  RFC8174:
  RFC8615:
  RFC8628:
  RFC9110:
  CLOUDEVENTS:
    title: "CloudEvents - Version 1.0.2"
    author:
      - org: Cloud Native Computing Foundation
    target: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
  CLOUDEVENTS-HTTP:
    title: "HTTP Protocol Binding for CloudEvents - Version 1.0.2"
    author:
      - org: Cloud Native Computing Foundation
    target: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/bindings/http-protocol-binding.md
  JSONSCHEMA:
    title: "JSON Schema: A Media Type for Describing JSON Documents (draft 2020-12)"
    target: https://json-schema.org/draft/2020-12/json-schema-core
informative:
  RFC6585:
  RFC7942:
  MCP:
    title: "Model Context Protocol"
    target: https://modelcontextprotocol.io/
  BESTSPEC:
    title: "BEST - Behavioral State Protocol (living specification)"
    target: https://behavioralstate.io/
---

--- abstract

The Behavioral State Protocol (BEST) defines a discovery-first, behaviour-oriented interaction surface for domain services: the commands a service accepts, the events it publishes, and optionally the queries it answers and the multi-step recipes (workflows) it publishes. Services are named by DNS domain names and self-describe through a manifest at the well-known URI "/.well-known/best"; messages use a conformant profile of the CloudEvents 1.0 envelope described by JSON Schema; and an agent obtains its own credential through the OAuth 2.0 Device Authorization Grant, approved by the person it acts for in their own browser. BEST deliberately specifies only the interaction surface -- never a service's internal architecture, storage, or execution model -- allowing independent implementations across any runtime, language, or transport to interoperate without bespoke integration.

--- middle

# Introduction

When an organisation operates multiple autonomous callers -- AI agents, process managers, integrations -- against heterogeneous systems, each pairing of caller and system tends to require a bespoke integration: the caller must be told, out of band, which operations the system accepts, what the payloads look like, how results are delivered, and how to associate a result with the request that caused it.

Command Query Responsibility Segregation (CQRS) provides the underlying semantics BEST builds on: writes are expressed as commands, and the results of processing are recorded as events. What CQRS does not provide is a common, machine-readable way for a caller to discover a service's command surface, observe its events, and correlate outcomes, without reading documentation or source code.

BEST fills this gap with five elements:

1. A discovery manifest at the well-known URI "/.well-known/best" describing the service's capabilities, transports, and authentication requirements, reached from a DNS name the service is known by.

2. A single command-ingestion entry point, "POST /commands", routed by the message "type" attribute rather than by URL structure.

3. A queryable event log, "GET /events", plus optional push delivery, through which the immutable facts produced by processing are observed; a first-class correlation identifier ties each event to the command that caused it.

4. An optional synchronous read surface, "GET /queries/{schema}", for reading current state before issuing a command.

5. An optional read-only recipe surface, "GET /workflows", publishing named multi-step sequences of catalogue operations ({{workflows}}).

BEST is deliberately not REST: there are no resources to manipulate and no CRUD verb semantics. Callers invoke named operations (commands such as "ProposeCounter" or "SubmitOrder") and observe the facts that result (events such as "CounterProposed"). Resource-oriented endpoints remain valid parts of a service's own API but are outside BEST's scope.

BEST's aim is that a service be agent-operable from a name alone: a person can say "use example.com" to an agent that has never heard of it, and the agent gets from that name to working use by itself. It resolves the name ({{name-resolution}}), reads the manifest, learns what each surface needs, obtains the credential it lacks ({{agent-registration}}), and operates. The person's part is reduced to what only a person can do: say what they want and -- once, in their own browser -- sign in or sign up, and approve the agent. Everything the agent needs is in the manifest and the catalogues, in structure rather than in prose. A service that needs no authentication at all is the simplest case of the same thing.

The protocol's design principles are: protocol-first (the specification defines the surface; implementations derive from it); compose, don't invent (the envelope is a CloudEvents profile {{CLOUDEVENTS}}, contracts are JSON Schema {{JSONSCHEMA}}, discovery uses a well-known URI {{RFC8615}}, tenancy uses URI templates {{RFC6570}}, agent registration is the OAuth 2.0 Device Authorization Grant {{RFC8628}}); discoverable by default; transport-agnostic; modular (implementers expose only the capabilities they support); implementation-agnostic (no prescribed language, framework, storage, or execution model -- a BEST service can equally be an AI agent, a deterministic backend, a sensor, or a human-operated workflow); and operable blind: a consumer that ignores every "description" and "guidance" string can still find every surface, know what opens it, and invoke every operation with schema-valid data. Prose tells a model what an operation means; it never carries where something is, what credential opens it, or what it is called.

This document specifies the protocol as released in version 0.9.19 of the living specification {{BESTSPEC}}.

## Conventions and Definitions

{::boilerplate bcp14-tagged}

Some requirements in this document are marked "(Required from 0.10.0)". Each is stated from the version of the living specification that introduced it, and binds conformance from protocol version 0.10.0; until then, validators report a violation as a warning, so that every implementer has at least one version of grace. The marker dates when an obligation binds; it does not plan a release.

Service:
: A BEST-compliant domain service that accepts commands and publishes events.

Command:
: An intent to change the system, sent to a service by any caller.

Event:
: An immutable domain fact published by a service as the result of processing.

Query:
: A synchronous read of current state (optional capability).

Workflow:
: A published, read-only recipe: a named sequence of catalogue operations with per-step guidance (optional capability).

Manifest:
: The JSON document served at "/.well-known/best" describing a service's capabilities, transports, and authentication requirements.

Capability:
: A named, composable unit of protocol surface declared in the manifest. Names use reverse-domain notation; the "io.best." prefix is reserved for this specification.

Correlation identifier:
: The value of the "correlationid" envelope attribute: the identifier that ties a command to the events its processing produces, across an arbitrarily long chain of commands and events.

Person:
: The human an agent works for.

Agent:
: A BEST consumer acting for a person; often a general-purpose language model.

Account:
: The scope a credential opens: a tenant, on a multi-tenant host.

Approver:
: Whoever may admit an agent to an account: the person themselves on a self-serve platform, an administrator on a provisioned one.

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
| time | required | required | Timestamp of message creation, as a date-time per {{RFC3339}}. |
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

CloudEvents describes events -- facts, which have an origin and no destination. BEST also carries commands in the same envelope, and a command has a destination; CloudEvents has no attribute for it and BEST adds none: the destination is the endpoint the command is posted to, and within it the server routes by "type". "source" is always the caller's declared origin, never a routing key. A service is free to use any internal envelope or dialect -- its own routing keys, its own use of identifiers -- behind an edge that accepts the conformant envelope and maps it. Nothing of that dialect is ever required from a caller or shown to one: no internal component name in a published schema, no internal identifier a caller must supply that the server can derive from the credential, and on the wire "correlationid" always means what this section says it means.

# Discovery

Every BEST endpoint serves a manifest at the well-known URI "/.well-known/best" ({{RFC8615}}) with media type "application/json", over HTTPS. This resource MUST be retrievable without authentication. The path is canonical; "/.well-known/best.json" MAY be served as an optional alias, but consumers MUST NOT rely on it. The "best" suffix is not currently registered in the Well-Known URIs registry (see IANA Considerations).

The manifest root is a single "best" object:

~~~
{
  "best": {
    "version": "0.9.19",
    "authentication": { ... },
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ],
    "extensions": { ... }
  }
}
~~~

version (required):
: The protocol version implemented, as MAJOR.MINOR.PATCH.

services (required):
: An object mapping service keys (reverse-domain names) to service definitions. Each service declares "version" and "description", an optional "spec" URL, an optional "authentication" block of its own ({{surfaces}}), and one or more transport bindings: "http" (the baseline -- its "endpoint" is the consumer-facing base URL to which all capability paths are appended) and optionally "mcp" (see {{transports}}). Multiple transports expose the same capability surface; they are alternative access methods, never separate operation sets.

capabilities (required):
: An array of capability entries. Each carries "name" (reverse-domain identifier), "version", "description", "spec" and "schema" URLs (required for "io.best." capabilities; optional for custom ones), an optional "service" key naming the implementing service when the capability name prefix does not match it, an optional machine-readable "endpoints" array of { method, path, description } entries appended to the service's "http.endpoint", an optional "status", an optional "extends" naming a parent capability, an optional "extensions" object ({{extensions}}), and -- on the events capability -- an optional "push" object declaring supported push channels ("sse", "mcp").

authentication (optional):
: Credential requirements for every service that declares none of its own; omitted for public endpoints (see {{authentication}}).

tenants (optional):
: Multi-tenant discovery (see {{multitenancy}}).

agents (optional):
: A snapshot of service descriptors hosted by the endpoint: each descriptor carries "id", "name", "accepts" and "produces" (PascalCase event type strings), "status" ("running", "paused", "stopped", or "error"), and optional "description", "type", "version", "endpoint", and opaque "metadata". This array is a discovery hint, not a live directory; BEST defines no registry endpoint. Implementations that manage services dynamically expose that as an ordinary domain (commands and queries) under their own namespace.

extensions (optional):
: Vendor-defined static declarations (see {{extensions}}).

Capability status semantics: "active" (the default) means every required endpoint exists and is callable; declaring "active" while returning 404 or 501 on a required route is a conformance violation. "partial" means a subset is implemented; consumers MUST NOT assume full coverage, and the available routes MUST be documented in the "endpoints" array. "planned" means nothing is callable yet. A workflows capability is "active" only while it publishes at least one recipe, and "planned" with none ({{workflows}}).

Individual command types are domain data, not capabilities: a specific type such as "ProposeCounter" MUST NOT appear as a manifest capability entry. The capability declares the command surface; the types are discovered at runtime via "GET /commands".

## Origin Discovery {#origin-discovery}

The manifest solves endpoint discovery: a consumer that already holds the BEST endpoint's URL learns everything else from it. It does not by itself solve origin discovery: an agent pointed at a product's public web origin ("https://example.com") has no defined path to the BEST endpoint, which commonly lives on another host ("https://api.example.com").

A deployment whose BEST endpoint is not the public web origin SHOULD bridge the gap:

1. Serve "/.well-known/best" on the public origin, either returning the manifest directly or redirecting (301 or 308) to the canonical manifest on the API host. Consumers MUST follow redirects on this path; the redirect target is the canonical endpoint for all subsequent interaction. The origin copy keeps the same public, unauthenticated requirement as the canonical one.

2. Advertise the bridge in the origin's HTML, so agents that fetch the page discover the manifest without prior BEST knowledge:

~~~
<link rel="alternate" type="application/json"
      href="/.well-known/best" title="BEST service manifest">
~~~

The manifest is the only entry. A deployment points at its manifest -- the well-known path, the redirect, the HTML link -- and MUST NOT publish a second description of its BEST surface for agents to start from: no "llms.txt" restating operations, no skill or prompt file, no client snippet carrying behaviour, no OpenAPI document of the BEST endpoints. A consumer that has the name has everything; anything else it is handed is a copy that will disagree with the manifest the first time the service changes. (Required from 0.10.0.)

A site's own "connect your assistant" page MAY give the person a sentence naming the service and the person's act -- "`Sign me in to <name>`", or "`Sign me up on <name>`" where the platform lets people sign up -- where `<name>` is a name the service is publicly known by. It MUST NOT append URLs, tenant identifiers or steps: the name is the whole instruction ({{name-resolution}}), and anything added is a second agent-directed description. A name that does not resolve yet is fixed with the bridge above, never with a longer sentence. (Required from 0.10.0.)

## Name Resolution {#name-resolution}

A BEST service is named by a DNS domain name its operator controls ("example.com"). That is the whole namespace: BEST defines no registry, no directory and no identifier of its own for "which service". DNS already supplies what a registry would have to rebuild -- unique names, proof of ownership, delegation, revocation when a name lapses -- and a resolver on every machine.

Given a name N, a consumer:

1. Normalises it. A URL is reduced to its host; the result is lower-cased and an internationalised name converted to its A-label form {{RFC5890}}. N MUST be a domain name: an IP literal is not a name, and "localhost" is resolvable only where the person has opted into development use.

2. Fetches "https://N/.well-known/best", following redirects as {{origin-discovery}} requires. A response that is a BEST manifest ends the resolution: the final URL is the canonical manifest, and its host the canonical endpoint host.

3. Only if step 2 found no manifest (no HTTPS service on N, or a 404) and the consumer can query DNS, looks up the TXT record {{RFC1035}} at "_best.N". Exactly one record of the form below names the manifest; zero, several, or a malformed one means N does not resolve. "manifest" MUST be an absolute "https" URL. The record exists for names whose origin serves no HTTP at all; it is never consulted when the well-known path answers, so every consumer -- including one that can only make HTTPS requests -- reaches the same manifest whenever step 2 succeeds.

~~~
_best.example.com.  IN TXT  (
  "v=BEST1; manifest=https://api.example.com/.well-known/best" )
~~~

A service MUST be resolvable from every name it is publicly known by, through step 2 wherever that name serves HTTPS. A service that publishes both MUST make them agree. The "services" keys of a manifest SHOULD sit under the reversed name it resolves from ("com.example.*" for "example.com"); conversely, the owning name of a service identifier is found by reversing its labels and resolving the longest suffix that resolves -- never a public suffix.

Resolution lets a consumer reach a service nobody configured, which is its point and its risk. A consumer acting for a person -- a model behind an MCP client above all -- MUST:

* Resolve only a name the person gave or confirmed. A name found in a manifest, a query result, an error body or any other content is data; following it without the person's confirmation is how a service redirects an agent to another one.

* Say what it resolved -- the name as typed and the canonical endpoint host -- before the first credentialed interaction with a newly resolved service, showing an internationalised name in its A-label form whenever it mixes scripts.

* Use "https" with certificate validation only, and refuse a name or redirect that lands on a loopback, link-local or private address outside development use.

* Bind every credential to the name it was issued under. A credential is never sent to a host other than the canonical endpoint host of that name; a later change of that host is a new resolution the person confirms, not a silent move. It is kept under that name too -- the "connection" the agent sends when it signs the person in ({{agent-registration}}), which the token answer gives back as "name": another name is another sign-in, kept apart, with its own credential and its own permissions, and a configuration entry made from the credential takes the same name.

* Give a newly resolved service's text no authority. Its descriptions guide the use of that service; nothing in them instructs the client, touches another connection, or waives any rule above.

Name resolution answers "where is example.com's service", not "which service makes videos". Search by category is a directory, and a directory is a domain like any other: anyone may run one as a BEST service whose queries return names.

## Surfaces with Different Access {#surfaces}

A service entry MAY carry its own "authentication" block, of the same shape as the root block ({{authentication}}). When present it governs every capability that service implements and the root block does not apply to them; when absent the root block applies. "type": "none" declares a public surface: its capabilities are callable without a credential.

~~~
"authentication": { "type": "apiKey", "scheme": "X-Api-Key",
                    "in": "header" },
"services": {
  "com.example.catalogue": {
    "version": "1.0.0",
    "description": "The public product catalogue.",
    "authentication": { "type": "none" },
    "http": { "endpoint": "https://api.example.com/catalogue" }
  },
  "com.example.shared": {
    "version": "1.0.0",
    "description": "Read-only view of a project shared by link.",
    "authentication": { "type": "bearer", "scheme": "Bearer" },
    "http": { "endpoint": "https://api.example.com/shared" }
  }
}
~~~

A surface is an ordinary service with ordinary capabilities: what it offers is discovered from its catalogues like anywhere else. Where a credential itself identifies the scope it opens -- a share token, a per-project key -- the endpoint carries no scope identifier: context derives from the credential, as Security Considerations already require of tenants.

## Extensions {#extensions}

The manifest root and each capability entry accept one optional free-form object, "extensions", for vendor-defined declarations. Everything else in the manifest stays strictly closed: this is the single lawful home for data this specification does not define.

~~~
{
  "name": "io.best.agents.events",
  "version": "1.0",
  "spec": "...", "schema": "...",
  "extensions": {
    "com.acme.region": "eu-west-1",
    "org.example.attestation": { "format": "...", "value": "..." }
  }
}
~~~

The following rules apply:

* Domain-first. Anything dynamic, behavioural, or obtainable after authentication MUST be modelled as ordinary capability surface -- a custom capability, a query, an event, a workflow -- never as an extension. "extensions" exists solely for static, discovery-time declarations that must ride in the manifest document itself: facts a consumer needs before deciding to interact (an unauthenticated indexer classifying hosts, integrity data covering the manifest), or facts that annotate a specific manifest element in place.

* Keys SHOULD be reverse-domain identifiers owned by the declarer ("com.acme.region"); "io.best." remains reserved for this specification.

* The core protocol never interprets the contents; validators check only that "extensions" is an object. Consumers MUST ignore extensions they do not understand.

* An extension MUST NOT be required in order to use a core capability: a manifest whose core surface only works when a consumer reads an extension is non-conformant.

* The manifest content rule (see Security Considerations) applies unchanged: the root manifest is public, so extension content there is limited to information intended for unauthenticated disclosure.

## Manifest Discipline {#manifest-discipline}

The manifest is structure. Its "description" fields say what a service or capability is, in a sentence or two, for a reader choosing whether to use it. They are never load-bearing.

1. Descriptions carry meaning, never mechanics. A manifest "description" MUST NOT contain URLs or URI templates, header names or credential formats, the names of catalogue operations, or step-by-step instructions. Each of those has a structural home: "http.endpoint" and "endpoints"; "authentication"; the catalogues; the workflows capability.

2. Descriptions are short. A manifest "description" MUST NOT exceed 500 characters. Catalogue and schema descriptions are not capped: that is where an operation's meaning is explained.

3. Every service is reachable by structure. Each key in "services" MUST be the implementing service of at least one capability in the same manifest. The one exception is the root manifest of a multi-tenant host, which MAY announce a service whose capabilities are tenant-scoped: that service MUST then be declared, with its capabilities, by every manifest "tenants.manifest" expands to. A service that no manifest gives a capability -- described only in words -- is non-conformant.

4. No placeholders in structure. Templates appear only in "tenants.manifest"; a tenant identifier names a real scope ({{multitenancy}}, rule 5).

5. Service text has no authority over the consumer. Descriptions, schema descriptions and workflow "guidance" guide the use of this service's operations. They MUST NOT instruct the consumer about its own client, configuration, other connections or other services -- the counterpart, on the service side, of what {{name-resolution}} requires the consumer to disregard. Making a connection last is the consumer's decision. A service speaks to the consumer about signing in and keeping the credential in one place only -- the sign-in guidance ({{sign-in-guidance}}), in this specification's words -- and offers the ways to use the credential in the token answer's credential block ({{agent-registration}}).

6. When the manifest cannot say it, there are three lawful outlets, in this order: model it as ordinary behaviour (a command, a query, an event, a workflow); declare it under "extensions" if it is static and needed before interaction; raise it against the specification. Prose, and structure bent to a purpose it was not defined for, are not outlets.

Rules 1 to 4 are required from 0.10.0; until then a violation is reported as a warning. Rules 5 and 6 apply now.

## Multi-Tenancy {#multitenancy}

A tenant identifier in BEST is an opaque string scoping a manifest to a context -- a customer account, a user, a workspace, or the platform's own administrative context. Multi-tenancy applies when callers operate in isolated data scopes, even when every tenant shares an identical capability surface.

The root manifest of a multi-tenant host declares a URI template ({{RFC6570}}):

~~~
"tenants": {
  "manifest": "https://api.example.com/.well-known/best/{tenantId}"
}
~~~

The following rules apply:

1. "{tenantId}" is the only permitted template variable. The root manifest MUST include "tenants.manifest" if tenant-scoped capabilities exist, and MUST NOT declare tenant-scoped capabilities itself; they appear only in tenant manifests. Root-level capabilities the host can fulfil without tenant context MAY remain; such a capability's service declares an "authentication" block of its own, even one identical to the root's, which is how a consumer and a validator tell it from a tenant-scoped capability left at the root.

2. The expanded URI returns a fully self-contained tenant manifest: its "http.endpoint" is pre-scoped, every "dataschema" URI is fully resolved, no "{tenantId}" placeholder appears anywhere, and it carries no "tenants" object of its own. Consumers treat it exactly as a single-tenant manifest.

3. Fetching the tenant manifest requires at most the credential declared in the root "authentication" object -- never a tenant identifier header, since the path already carries it.

4. URI templating is valid only in "tenants.manifest". Everywhere else in the protocol, URIs MUST be fully resolved.

5. A tenant identifier names a real scope. A constant pseudo-tenant ("public", "default", "anonymous") used to host a surface that has no scope is non-conformant; such a surface is declared as a root-level service with its own "authentication" instead ({{surfaces}}). (Required from 0.10.0.)

6. The tenants root says where a credential belongs. A service the root manifest announces for its tenants ({{manifest-discipline}}, rule 3) MAY give it, in the root manifest, the "http.endpoint" that each tenant manifest's "http.endpoint" for the same service extends with "/{tenantId}": its tenants root (for example "https://api.example.com/api/best/tenants" for a tenant endpoint "https://api.example.com/api/best/tenants/acme"). It MUST do so when its token answer names no "tenant_id", unless its root is itself a surface ({{agent-registration}}). A consumer finds the tenants root as that service's "http.endpoint" in the root manifest. A GET on a tenants root SHOULD answer, with a credential, 200 and the tenants that credential opens, as { "tenants": [ { "tenant_id", "endpoint", "manifest" } ] }; it MUST do so for a credential answered with no "tenant_id". Without a credential it answers the 401 a tenant endpoint gives, naming the way in. A service that cannot tell which tenant a credential opens answers a BEST error that says where the consumer finds it -- the "endpoint" of the token answer and its "tenant_id" where it has one, or a new sign-in; a credential answered with no "tenant_id" is never answered so, since its tenants are listed. A tenants root never answers a bare 404: a consumer that kept only its credential -- a model after a restart -- would otherwise conclude it has no account. A root whose service is itself a surface -- commands and queries of its own at its "http.endpoint", its tenants under another path -- has no tenants root: it lists the tenants a credential opens through its own catalogue, a query whose answer carries each tenant's "tenant_id", "endpoint" and "manifest", and its tenant manifest route answers an unknown or guessed identifier with a BEST error that names that query.

# Authentication and Agent Registration {#authentication}

## Authentication Block

The "authentication" object appears at the manifest root and, optionally, on a service entry ({{surfaces}}), where it governs that service alone:

~~~
"authentication": {
  "type": "apiKey",
  "scheme": "X-Api-Key",
  "in": "header",
  "docs": "https://docs.example.com/authentication"
}
~~~

type (required):
: "none", "bearer", "apiKey", or "oauth2".

scheme (optional):
: For "bearer", the Authorization prefix ("Bearer"); for "apiKey", the header or query parameter name.

in (optional):
: "header" or "query" (for "apiKey").

scopes (optional):
: Required OAuth 2.0 or token scopes.

tokenUrl (optional):
: An OAuth 2.0 token endpoint {{RFC6749}}. It serves the "client_credentials" exchange for header-constrained clients ({{token-exchange}}) and, where "deviceAuthorizationUrl" is declared, the device-code grant that completes a registration.

deviceAuthorizationUrl (optional):
: How an agent obtains this credential by itself: a device authorization endpoint {{RFC8628}} (see {{agent-registration}}). Requires "tokenUrl" and "note". Omitted when credentials are only issued out of band.

note (required with deviceAuthorizationUrl):
: The sign-in guidance's manifest text, verbatim ({{sign-in-guidance}}).

docs (optional):
: A page for people. A consumer never depends on it.

Consumers MUST read this block before calling anything else. A consumer that holds no credential for a surface registers through "deviceAuthorizationUrl" when it is present; only when it is absent does it ask the person for a credential obtained out of band. The block's "note" says how, step by step.

## Token Exchange for Constrained Clients {#token-exchange}

Some legitimate clients cannot set HTTP headers -- URL-only integrations, webhook targets, legacy tooling. The escalation path is: prefer headers ("Authorization: Bearer" or the "apiKey" header); fall back to a body-based token exchange at "tokenUrl", for a client that can POST a body but not set custom headers; and only then, for a client that controls nothing but a URL, send the exchanged short-lived token as the "access_token" query parameter per {{Section 2.3 of RFC6750}}. The long-lived credential never appears in a URL.

When "type" is "oauth2", "tokenUrl" MUST name an OAuth 2.0 token endpoint {{RFC6749}}. Hosts intending to serve header-constrained clients SHOULD accept the "client_credentials" grant -- a form-encoded POST requiring no custom headers -- and return "access_token", "token_type", and "expires_in" per {{Section 5.1 of RFC6749}}. Exchange-issued tokens SHOULD be short-lived (minutes, not days). Tenant context derives from the credential itself: a tenant identifier submitted alongside it is at most a routing hint, and a server MUST reject an exchange whose declared tenant does not match the credential's tenant binding. A long-lived credential SHOULD NOT be declared or accepted as a query parameter ("apiKey" with "in": "query"); a host that needs to serve URL-only clients SHOULD offer the exchange instead.

One-time login links -- a single-use, short-lived code minted out of band, for example from an operator dashboard, and redeemed for a scoped token -- are a valid implementation of this exchange for URL-only onboarding. BEST does not standardise their issuance; a host advertising one does so under a namespaced "extensions" key ({{extensions}}).

## Agent Registration {#agent-registration}

A service that lets an agent obtain its own credential declares "deviceAuthorizationUrl" and "tokenUrl". The exchange is the OAuth 2.0 Device Authorization Grant {{RFC8628}}, unchanged; BEST adds three request parameters ("connection", "agent_label", "credential_lifetime"), three members of the token answer ("name", "tenant_id", "auth_header"), the credential block that comes with the credential, and the sign-in guidance ({{sign-in-guidance}}): the words, fixed by this specification, that tell the consumer at each step what to do.

1. The agent asks: a form-encoded POST to "deviceAuthorizationUrl", with no credential, carrying the parameters below.

2. The service answers at once ({{Section 3.2 of RFC8628}}): "device_code", "user_code", "verification_uri", optionally "verification_uri_complete", "expires_in", "interval". The "device_code" is generated by the service, unguessable, and is neither derived from nor usable as any identifier -- not an envelope "id", not a "correlationid", not an account or registration identifier. The answer also carries "note": the device text of the sign-in guidance, verbatim.

3. The agent gives the person "verification_uri_complete" (or "verification_uri" and "user_code") before anything else, to open in their own browser. It MUST NOT open the link itself or in a browser it controls: approving is the person's act, and a page the agent drives could approve for them or put their password within its reach. It polls "tokenUrl" with "grant_type=urn:ietf:params:oauth:grant-type:device_code" and its "device_code", no faster than "interval". "authorization_pending" and "slow_down" are not errors; "access_denied" and "expired_token" end the registration ({{Section 3.5 of RFC8628}}). A service SHOULD keep answering "expired_token" for an expired "device_code" for at least as long as the code lived, so a late poll learns why; after that, "invalid_grant" is acceptable.

4. On approval the token endpoint answers per {{Section 5.1 of RFC6749}} -- "access_token", "token_type", and "expires_in" when the credential is not durable or its approver bounded its life -- with three BEST members: "name", the connection's name -- the "connection" the agent sent, or the address of the sign-in manifest when it sent none; "tenant_id", the account the credential opens; and "auth_header", the header that carries the credential when that is not "Authorization". "token_type" is "Bearer" for a credential sent as "Authorization: Bearer", and "apikey" for one sent in the header "auth_header" names. A "device_code" is redeemed once.

The device authorization request takes these parameters:

client_id (required, per RFC 8628):
: The name of the consumer software. BEST services pre-register no clients: the value is caller-declared and, like "source", never identity.

connection (optional):
: The name of this connection: one word of lowercase letters, digits and hyphens (matching "^[a-z0-9][a-z0-9-]{0,63}$"), made from the name the person gave the service -- "acme payroll dev" becomes "acme-payroll-dev"; its host when they gave none -- and confirmed with them before the request. The same person signing in to two doors of one platform (a customer surface and a back office, each with its own credential and its own permissions) gives two names. The service keeps it with the registration and gives it back as "name" in the token answer, unread: it is the consumer's label, never identity. Another shape is "invalid_request", with an "error_description" that states the shape.

agent_label (optional):
: What the approver reads when asked to admit this agent, recognisable to them ("Claude on Ada's phone").

credential_lifetime (optional):
: "durable" (the default) or "session". A consumer that cannot keep a secret out of a conversation sends "session". The value only ever lowers what is issued.

The token answer also carries the credential block: what the consumer needs to decide what to do with the credential, because the consumer is often a model making the requests itself, and this answer is the only thing that reaches it with the credential.

note (required):
: Begins with the token text of the sign-in guidance, verbatim. A service MAY add to it after that text.

name (required):
: The connection's name: the "connection" the agent sent, else the address of the sign-in manifest (its host, with its port when it has one, and its path when it is not at the root). The credential is kept under it, and the "mcp" entry is keyed by it.

endpoint (required):
: The surface the credential opens (the tenant endpoint on a multi-tenant host), on the canonical endpoint host.

manifest (optional):
: That surface's manifest.

ready_check (optional):
: A URL on the credential's host whose GET, with the credential, answers 200 once the credential works.

mcp (optional):
: This connection as an MCP client's configuration: an object with one member keyed by "name", whose value is the client's server entry, the credential in its environment. Two sign-ins are two names the person gives, so two entries: neither overwrites the other.

http (optional):
: The surface for direct calls: an object with "header", the header line with a placeholder for the credential ("`X-Api-Key: <access_token>`"), "commands" and "queries", the catalogue URLs, and "events", the event log's URL, on the canonical endpoint host.

The consumer chooses: an MCP-capable client writes "mcp" into its own configuration, one without MCP keeps the credential for direct calls, and a client with its own store keeps it there and redacts it from everything the model sees. The credential appears only in "access_token" and in "mcp" -- never in "note", "http" or any example. Each URL in the block the credential may be sent to -- "endpoint", the URLs in "http", the base URL in "mcp" -- MUST be on the canonical endpoint host of the name the consumer resolved, and a consumer MUST NOT send the credential to one that is not ({{name-resolution}}). A page for people ("docs") may be elsewhere; the credential never goes there.

A credential that opens no single account: the token answer has no "tenant_id" when the credential opens no one account -- on a service without tenants, or when it was admitted at the root of a host where one identity may hold several tenants, or none yet. Its "endpoint" is then the root service's, and the credential works there. A service with tenants that answers so MUST list, at its root, the tenants such a credential opens, each with its "tenant_id", "endpoint" and "manifest", as {{multitenancy}} rule 6 says: by its tenants root, or by a query of its own catalogue where the root is itself a surface. (Required from 0.10.0.) "tenant_id" is never the host or another stand-in, which a consumer would expand into "tenants.manifest" and reach no account.

A credential that ends: after the agent's credential is revoked, or once it runs out, every request under it is refused with 401, and an event stream open under it MUST end within a bounded time whether or not events flow, since a 401 on the next request never reaches it; the stream of a credential that revoked itself first delivers that command's outcome, so the agent sees its command complete. An approver MAY bound a credential's life when admitting it: the token answer's "expires_in" then says the bound, and a bound the service cannot honour is refused, never shortened silently. (Required from 0.10.0.)

Errors: "deviceAuthorizationUrl" and "tokenUrl" answer errors per {{Section 5.2 of RFC6749}} (for the device endpoint, by {{Section 3.2 of RFC8628}}), not in the BEST error format: status 400 (or 401 for a client failure) with a JSON body carrying "error" and, RECOMMENDED, "error_description". A request that is not form-encoded is "invalid_request" -- never a bare status with an empty body, because the agent is often a model that corrects itself only from what the answer says. "tokenUrl" uses the codes of {{Section 3.5 of RFC8628}}. (Required from 0.10.0.)

Nothing in this exchange is a BEST command, a catalogue entry or a workflow: it needs no public surface, no recipe and no prose beyond the sign-in guidance, and a client implements it once for every service. A registration is deliberately not a command: a command has no synchronous answer, so an anonymous caller could be tied to its registration only by an identifier it chose, and that identifier would end up accepted as the secret. What happens on the page the person opens -- signing in, signing up, approving -- is the platform's own ({{identity}}).

## Sign-in Guidance {#sign-in-guidance}

The consumer is often a general-purpose model that knows nothing of BEST, and what reaches it while it signs a person in is all it has to go on. So a service that declares "deviceAuthorizationUrl" says what to do at each of three steps in the words below, verbatim -- the same on every service, so that no implementation can drop a point:

* the "note" of the "authentication" block that declares "deviceAuthorizationUrl" carries the manifest text;

* the "note" of the device authorization answer carries the device text;

* the "note" of the token answer carries the token text first; a service MAY add to it after.

Manifest text:

> For you, the agent, not the person: read this manifest with an HTTP request; never show it to them or open it in a browser. When the person asks you to sign them in, first name the connection: one word of lowercase letters, digits and hyphens, made from what they called this service (acme payroll dev becomes acme-payroll-dev; its host if they gave no name), and ask them to confirm it before you go on. Then POST a form to deviceAuthorizationUrl with client_id set to your software's name and connection set to that name, and give them the link it answers (verification_uri_complete, or verification_uri and user_code) to open in their own browser, where they sign in and approve you. Never open that link yourself or in a browser you control, never sign in for them, and never ask for a password. Then poll tokenUrl, no faster than interval. Its answer carries a secret credential and, in name, the connection's name: save the credential straight to your client's credential store or to a file only the person can read, under that name, and never put it in a message, a command or any output: read the rest of the answer without it.

Device text:

> Give the person this link, verification_uri_complete (or verification_uri and user_code), to open in their own browser, where they sign in and approve you. Never open it yourself or in a browser you control: approving is theirs. Then poll tokenUrl no faster than interval, with a form of grant_type=urn:ietf:params:oauth:grant-type:device_code, device_code and client_id. Its answer carries a secret credential and, in name, the connection's name: save the credential straight to your client's credential store or to a file only the person can read, under that name, and never put it in a message, a command or any output: read the rest of the answer without it.

Token text:

> The credential is a secret. Keep it in your client's configuration or credential store, under the name in this answer, the connection the person named: another name is another sign-in, kept apart, with its own credential and its own permissions. Never repeat it in the conversation, in a message, a command or any output: read it from where you stored it. A transcript, commands and their output included, is not a secret store, and a credential that appears there is leaked and must be replaced. If your client cannot store it, say so instead of showing it.

The same texts are published in the living specification's discovery schema {{BESTSPEC}}, one set per version that changed them. They change only with the specification, and every implementation takes them unchanged. Each version's texts stay published: a service carries the texts of the version it declares, or of a later one, so it is never non-conformant for not having moved yet, and a service that declares a version carries at least that version's words. A consumer whose own client makes these requests follows them itself and need not show them to its model.

## Identity and Registration: a Described Pattern {#identity}

This section is not normative. BEST defines no identity provider, no account model and no login; a platform that has them keeps them. The one thing BEST fixes is how an agent obtains its credential ({{agent-registration}}); this section names the parts so that implementers use the same words for the same things.

The flow is one, whatever the person said and whether or not they have an account. The person says "sign me in to example.com" -- or "sign me up", or "connect me". The agent registers itself and gives the person a link and a code. The link opens a page of the platform where the person signs in, or signs up if the platform offers that, and approves the agent. The agent collects its credential and, with it, the account's identifier. The agent never needs to know whether an account existed.

| Behaviour | Whose | Where it happens |
|---|---|---|
| Register agent | the agent's | the device authorization request, not a BEST command |
| Sign in | the person's | the platform's own page, reached from the link the agent shows |
| Sign up (where offered) | the person's | the same page; also where the account is opened |
| Approve agent | the approver's | the same page, once signed in |
| Revoke agent | the agent's, or the approver's | a command under that credential; or the platform's UI |
| Sign out | the person's | the platform's own UI; touches no agent credential |
{: title="Identity behaviours"}

Signing in, up and out belong to the person and happen on the platform's pages, with its identity provider: the agent never sees a password, never performs or simulates them, and no BEST operation or workflow is named after them. Registering and revoking belong to the agent: an operation that revokes a key is a revocation, not a sign-out. Ending the person's session leaves every agent credential alive; revoking a credential leaves the person's session alive.

Where the credential lives is the consumer's business. A client with its own store makes the token request itself, keeps the credential where the model never sees it, and has it again at every later start. An agent with no such client -- a model in a chat making HTTP requests -- has nowhere to put a secret but the conversation; it registers with "credential_lifetime=session", and what it receives is short-lived. A platform may let an agent open an account itself; that is an ordinary command carrying the "commitment" impact category ({{impact}}), confirmed with the person before it is sent.

# Commands

Commands are intents to change a domain service. The service validates, queues, and processes them asynchronously; results surface as events ({{events}}).

| Method | Path | Description |
|---|---|---|
| GET | /commands | Command catalogue: all accepted command types with schema URIs |
| POST | /commands | Send a command (BEST envelope); validates, queues, returns 201 |
| GET | /commands/{schema}/{version} | JSON Schema document for one command type and version |
{: title="Command endpoints"}

## Catalogue

"GET /commands" returns the list of command types the service accepts. Each entry carries "schema" (a kebab-case name used as the "{schema}" path segment; distinct from the PascalCase envelope "type"), "version", an optional "commandType", "dataschema" (a resolvable URI that is the exact value to place on a command envelope, resolving to "GET /commands/{schema}/{version}" on the same surface), an optional "description", an optional "workflows" array of workflow identifiers (see {{workflows}}), and an optional "impact" annotation (see {{impact}}).

"commandType" is the exact envelope "type" to send for the command ("ProposeCounter"). When it is absent, consumers derive the type as the PascalCase form of "schema"; servers SHOULD state it, because a derivation is a guess. Like "workflows" and "impact", it is carried on both surfaces -- the catalogue entry and the schema document, as a top-level member with the same value.

The schema document returned by "GET /commands/{schema}/{version}" has media type "application/schema+json". It MAY declare a "produces" array of PascalCase event types the command can raise (e.g. ["CounterProposed", "NegotiationFailed"]). Failure outcomes are ordinary events in that list; naming conventions such as a "Failed" suffix are service-defined. BEST defines no timeout protocol: services SHOULD document expected processing times and SHOULD always publish a failure event rather than silently dropping a command; callers decide how long to wait.

## Impact Annotations {#impact}

Some commands do not share a blast radius with the rest of the catalogue: the person the consumer acts for would want to be asked first. They move money, destroy data, cannot be undone -- or commit the person to something, or let someone new into what is theirs. The optional "impact" annotation declares this, so a consumer can discover which commands warrant extra care before submission:

~~~
{
  "schema": "submit-order",
  "version": "1.0",
  "dataschema":
    "https://api.example.com/commands/submit-order/1.0",
  "description": "Submit a market order",
  "impact": {
    "categories": ["financial"],
    "confirmation": "required",
    "warning": "Places a real order on your broker account.
                Capital is at risk."
  }
}
~~~

categories (required):
: The kinds of impact, as named values: "financial" (moves money or puts capital at risk), "destructive" (removes data or state), "irreversible" (no compensating command), "compliance" (bypasses or alters a compliance control), "commitment" (binds the person: opens an account, accepts terms, starts a subscription, creates personal data in their name), "access" (grants a principal access to what belongs to the person: issues a credential, shares a resource, invites a member). The vocabulary is open; consumers MUST treat unknown values as high-impact.

confirmation (required):
: "required" means a consumer acting on behalf of a human MUST NOT submit the command without explicit, per-submission confirmation from that human. "recommended" means the consumer SHOULD confirm but MAY proceed where the human has durably authorised this class of operation.

warning (optional):
: A human-readable warning the consumer SHOULD surface to the human, substantially intact, before asking for confirmation.

The annotation is carried on both surfaces that describe an operation -- the catalogue entry and the schema document, as a top-level member -- and both MUST carry the same value. It is descriptive, not enforcement: it tells a well-behaved consumer what to do before submitting, and never substitutes for the server-side controls on high-impact commands (see Security Considerations), because a server cannot rely on clients honouring it. Service-to-service automation with no human principal is governed by those server-side controls alone; the annotation does not require inventing a human to ask.

## Ingestion Semantics

"POST /commands" processing proceeds as follows:

1. Validate that the required envelope attributes are present.

2. Look up the validation schema in the server's own catalogue, keyed by a server-owned identifier (the "type", or the schema name carried in "dataschema"). The inbound "dataschema" value is a selector, not a location: servers MUST NOT fetch a caller-supplied "dataschema" URI (see Security Considerations). Schema selection, authorisation, and dispatch MUST key on the same identifier.

3. Validate "data" against that schema.

4. Check the command against the service's current state: a well-formed command the service cannot honour now (no room for it, nothing by the name it gives) is refused with 400, a service-defined "code" that names the condition, a "message" that says what to do, and "details" a program can act on.

5. If valid, durably queue the command and return 201 with a JSON body carrying "id" (the command's envelope id) and "correlationId" (the effective correlation identifier, {{correlation}}). If invalid, return 400.

A command refused at step 4 was never accepted: its "id" is free for the corrected retry. A retry of an accepted command is answered as the original was, without the check, where the service answers a duplicate rather than rejecting it.

The envelope "id" is an idempotency key, scoped to the credential that sent it and kept for a retention window the service states in its documentation. A duplicate (the same "id" from the same credential) is rejected with 409 naming the "id", or safely ignored; a reused "id" with a different payload MUST be rejected with 409. A duplicate that is safely ignored is answered as the original was, with the original's status, "id" and "correlationId", and runs nothing again, so a client that lost the first answer and retries gets exactly what it missed. Two credentials do not collide on an idempotency key, though a command that names no "correlationid" takes its "id" as its correlation identifier, which belongs to the sender that used it first ({{correlation}}). The "type" attribute is the routing key; "source" MUST NOT be the sole routing key.

201 signals that the command was durably recorded and processing will happen. A server that cannot durably enqueue before responding MAY return 202 instead, which carries no durability guarantee. A durably recorded command is processed even if the service restarts before it ran: after a restart the service processes it, through the same state check as if it had just arrived, or publishes its failure event. It is never dropped silently.

## Correlation {#correlation}

BEST defines no synchronous command response; the result of processing is one or more published events, tied to the command by the "correlationid" envelope attribute.

The caller MAY set "correlationid" on a command; when it is absent, the server adopts the command's "id" as the correlation identifier. In both cases the 201 response echoes the effective value as "correlationId". Every event produced by processing the command MUST carry that identifier in its "correlationid" attribute, so any consumer -- including one that never saw the command -- can match events to their originating submission. So MUST every later fact about what the command created (a deployment that ends hours after it was ready, a job that finishes), for as long as the thing lives, so that a consumer filtering on the correlation identifier sees its whole life (required from 0.10.0 for the later facts). Events with no command behind them MAY omit the attribute.

In a multi-step process, a follow-up command issued in reaction to an event, by the same sender, SHOULD carry the same "correlationid", so one identifier ties the steps of a process together. Correlation and idempotency are separate concerns: "id" remains unique per message, while "correlationid" groups messages into a process.

A correlation identifier belongs to the sender that first used it on a surface: the authenticated credential whose accepted command first carried it. A command from another sender naming it MUST be refused with a 400 whose details name the field, and what a credential may read of a correlation derives from that ownership, never from the identifier alone. (Required from 0.10.0.) Two consequences follow. A command with no "correlationid" takes its "id" as its correlation identifier, so two senders sending one "id" without a correlation identifier are one accepted and one refused; the fix is a correlation identifier of the sender's own. And a chain of commands under one correlation identifier is one sender's: a service that reacts to an event under its own credential starts a correlation of its own.

~~~
POST /commands                    -> 201 { "id": "abc123",
                                          "correlationId": "abc123" }
GET  /events?correlationId=abc123        -> what has already happened
GET  /events/stream?correlationId=abc123 -> what happens next (push)
~~~

# Events {#events}

Events are immutable facts published as the result of processing: none is changed once told.

| Method | Path | Description |
|---|---|---|
| GET | /events | Historical query: paginated, filterable log of past events |
| GET | /events/stream | Live stream (Server-Sent Events): events produced after the connection opens |
| GET | /events/{schema}/{version} | JSON Schema document for one event type and version |
{: title="Event endpoints"}

"GET /events" and "GET /events/stream" are complementary: a caller loads history first, then opens the stream.

An event with "dataschema" is typed: consumers can fetch the schema and validate. Without it, the event is untyped and the consumer interprets "data"; the envelope ("type", "source", "id", "correlationid", "time") still supports routing and correlation. Both patterns can coexist in one service.

BEST makes no replay guarantee: "GET /events" returns whatever the server currently exposes -- a full log, a recent window, or a view of domain records mapped to the event shape at query time. Clients MUST NOT assume completeness, ordering, or replay fidelity. For reliable point-in-time delivery, callers use a push channel.

## Historical Query

Query parameters on "GET /events", all optional and combinable: "type" (filter by envelope type), "correlationId" (only events whose "correlationid" attribute matches), "source", "from" and "to" (time-range bounds, inclusive), "limit" (servers MAY apply a lower ceiling), and "after" (an opaque pagination cursor from a previous response's "nextCursor"). "from" and "to" are date-times per {{RFC3339}}, the form of the envelope's "time"; any other form is a 400 naming the parameter (required from 0.10.0). Responses are an object with an "events" array and, when further pages exist, a "nextCursor" string.

## Event Types

There is no listing of events: "GET /events" is the log, and nothing else. A typed event's schema document is at "GET /events/{schema}/{version}", where the event's own "dataschema" points; a command's schema document names in "produces" the event types it can raise, which is how a consumer learns them before any has been told. Untyped events rely on the "description" of the command that produces them.

## Live Stream

"GET /events/stream" is requested with "Accept: text/event-stream" plus credentials; optional filters are "correlationId", "type", and "source". Each event arrives as an SSE "data" field containing the envelope JSON, with the envelope "id" echoed as the SSE event id. On reconnection, clients send "Last-Event-ID" and the server replays anything produced after it. A "Last-Event-ID" the server never told, or no longer holds, is no position in its log: the server SHOULD then deliver from now on, as for a new connection, and the client reads what it missed from "GET /events". Servers SHOULD send keepalive comments and MAY close the stream after inactivity or a terminal event; clients MUST handle reconnection.

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

The query schema document has up to three sections: "description", "parameters" (a JSON Schema for accepted query-string parameters, omitted when the query takes none), and "response" (a JSON Schema for the result body; required). Query catalogue entries and schema documents MAY carry the same "workflows" cross-link array as their command counterparts ({{workflows}}). Execution returns 400 for missing or invalid parameters and 404 for an unknown schema name.

The "parameters" schema governs what an execution accepts: the query string is validated against it, each value a string, so the schema declares its parameters as strings (a number by a "pattern"), and a failure is a 400 whose details name the parameter (required from 0.10.0). A parameter the schema does not declare is refused only when the schema says "additionalProperties": false; a query whose document has no "parameters" ignores any it is sent.

Queries are not a query language (no filter expressions, joins, or aggregations), not a REST resource hierarchy (no per-item paths), and not event sourcing (they return current state as the service projects it; historical facts live in "GET /events").

# Workflows {#workflows}

Workflows are published recipes: read-only, named sequences of catalogue operations with per-step guidance, for multi-step processes whose order is a fixed, well-known happy path. The capability ("io.best.agents.workflows") is optional and strictly descriptive: the service never executes, retries, tracks, or branches the steps; the caller -- typically an autonomous agent -- sends each operation itself and waits for its outcome before proceeding.

| Method | Path | Description |
|---|---|---|
| GET | /workflows | Workflow index: "id", "name", "description" per recipe, never the steps |
| GET | /workflows/{id} | One full recipe with its ordered steps; 404 for an unknown id |
{: title="Workflow endpoints"}

The index is deliberately shallow, so a consumer can hold the entire list in one read and choose; full recipes are fetched one at a time. A service declares the capability "active" only while it publishes at least one recipe; one that publishes none, yet or any more, declares it "planned" and serves no index, so a consumer that reads "active" finds something to follow (required from 0.10.0). Workflow identifiers are stable, service-defined, URL-path-safe strings (reverse-domain notation or kebab-case); renaming an identifier is a breaking change for anything linking to it.

Each step of a recipe carries "kind" ("command" or "query": whether the step is a "POST /commands" or a "GET /queries/{schema}"), "dataschema" (the resolvable URI of the operation's schema document in the service's live catalogue -- recipes reference the catalogue and never duplicate it, so they cannot drift from the real contracts), an optional "optional" flag (true when the step applies only in some runs), and optional "guidance" (how the step combines with the others: what to carry forward, what to wait for, when to skip). "guidance" is bound by {{manifest-discipline}} rule 5: it speaks about this service's steps only, and never tells the consumer what to do with its own client or configuration.

~~~
GET /workflows/io.example.workflows.onboard-a-worker
{
  "id": "io.example.workflows.onboard-a-worker",
  "name": "Onboard a worker",
  "description": "Create the engagement, assign a contact, and
    invite the worker. Drive each step yourself and wait for its
    outcome before the next.",
  "steps": [
    { "kind": "command",
      "dataschema":
        "https://api.example.com/commands/submit-employee/1.0",
      "guidance": "Creates the engagement. Keep the correlationId
        -- every later step references it." },
    { "kind": "query",
      "dataschema":
        "https://api.example.com/queries/list-employees/1.0",
      "guidance": "Poll until the new engagement appears --
        commands are asynchronous." },
    { "kind": "command",
      "dataschema":
        "https://api.example.com/commands/invite-worker/1.0",
      "optional": true,
      "guidance": "Only when the user wants the invitation sent
        immediately." }
  ]
}
~~~

Cross-linking is the single discoverability mechanism: an operation advertises the recipes it belongs to through the "workflows" array -- the identifiers of the published workflows the operation participates in -- carried on its catalogue entry and on its schema document as a top-level member (JSON Schema tolerates unknown keywords; BEST names this one, and validators ignore it). Both surfaces carry the same array, so the pointer is present at whichever read a consumer performs before acting. Servers publishing workflows SHOULD stamp it in both places for every operation that appears in a recipe; consumers SHOULD fetch the referenced recipe before composing a multi-step sequence themselves. Human-readable descriptions are free to mention recipes, but the protocol attaches no discoverability role to prose.

The capability's boundary is deliberate: the moment a service executes, retries, persists, or branches steps on the caller's behalf, it has built an execution runtime, which is out of BEST's scope. Execution engines belong behind the service, not behind this capability.

# Transports {#transports}

HTTP is the baseline transport: every conformant service exposes it. All requests and responses are "application/json" (schema documents are "application/schema+json"; the event stream is "text/event-stream").

"POST /commands" carries one BEST envelope in the CloudEvents structured content mode {{CLOUDEVENTS-HTTP}}. Servers MUST accept "Content-Type: application/cloudevents+json" and, for compatibility, "application/json"; consumers SHOULD send the former. With it, a CloudEvents SDK's HTTP sender produces a valid BEST request unchanged. (Accepting "application/cloudevents+json" is required from 0.10.0.)

Every capability path is appended to the service's "http.endpoint"; the leading slash is a separator, not a root-relative indicator. For example, with "http.endpoint" of "https://api.example.com/tenants/acme", the path "/commands" resolves to "https://api.example.com/tenants/acme/commands". The "http.endpoint" value MUST be the consumer-facing public address, never an internal backend or service-mesh URL.

Authentication follows the "authentication" object governing the service -- its own, else the root's: "bearer" maps to "Authorization: Bearer" credentials; "apiKey" to a header or query parameter named by "scheme". "GET /.well-known/best", the capabilities of a service that declares "type": "none", and the "deviceAuthorizationUrl" and "tokenUrl" endpoints need no credential; every other endpoint requires one when one is declared.

All error responses, except those of "deviceAuthorizationUrl" and "tokenUrl" ({{agent-registration}}), use a consistent body:

~~~
{ "error": { "code": "SCHEMA_NOT_FOUND",
             "message": "Unknown command schema 'foo'",
             "details": {} } }
~~~

Status codes carry the semantics of {{RFC9110}}; the 429 status code is defined in {{RFC6585}}.

| Status | Meaning |
|---|---|
| 200 | Success with body (queries, event lists, catalogues, schema documents) |
| 201 | Command accepted and durably queued |
| 202 | Accepted without durability guarantee |
| 400 | Invalid request body or parameters (schema validation failure), or a well-formed command the service cannot honour in its current state, with a code that names the condition |
| 401 | Missing or invalid credentials (only when the governing authentication type is not "none") |
| 404 | Unknown route, schema name, or version |
| 409 | Duplicate command "id": with a different payload always, with the same payload when the service rejects a duplicate rather than ignoring it |
| 413 | Request body exceeds server limits |
| 415 | "POST /commands" with a Content-Type the server does not take; the error says which it takes |
| 422 | Semantic error (capability not supported) |
| 429 | A command past the server's pace; Retry-After says when to send again |
| 500 | Internal error |
{: title="HTTP status codes"}

A Model Context Protocol {{MCP}} binding MAY additionally be declared in a service's "mcp" transport object ("transport" -- "stdio", "sse", or "http" -- "server", optional "push" and a transport-scoped "authentication" object). Every MCP tool wraps exactly one HTTP endpoint; the binding exposes the same logical capability surface to LLM tooling that cannot call HTTP APIs directly. When "push" is true, the server MAY deliver events as MCP server-to-client notifications, matched by correlation identifier.

## First Contact

The canonical first-contact algorithm for an agent or automated client is:

1. Fetch the root manifest ("GET /.well-known/best", always public). Extract "authentication" -- the root block and any a service declares for itself -- and "tenants.manifest" before anything else. Where a block declares "deviceAuthorizationUrl", its "note" is the sign-in guidance: follow it. The manifest is for the agent, not the person.

2. Identify the manifest type and collect prerequisites before making any authenticated request. A manifest with the commands capability is a direct service; one with "tenants.manifest" and no commands capability is a multi-tenant router. In both, the agent needs nothing from the person if it holds a credential or the surface is public, and otherwise registers through "deviceAuthorizationUrl", asking the person for a credential only when that is absent. A completed registration yields the credential and the tenant identifier together; the agent never asks the person for a tenant identifier the registration can give. A commands capability with "status": "planned", or empty "capabilities" with no "tenants.manifest", is reported to the person.

3. Multi-tenant only: expand the template with the tenant identifier, fetch the tenant manifest with credentials, then treat it exactly like a direct service manifest. With no tenant identifier, use the root's services, and expand the template with a "tenant_id" the root lists for the credential.

4. Read the capability's "endpoints" array and resolve each path against the "http.endpoint" of the service named in the capability's "service" field (or the matching-prefix service if absent).

5. Fetch the catalogues -- "GET /commands", and "GET /queries" if declared -- which are the definitive answer to "what can I do here". Then fetch the schema for the chosen operation, execute it, and observe results by correlation identifier.

# Conformance

A BEST-compliant endpoint MUST:

1. Expose "GET /.well-known/best" returning a valid manifest: status 200, publicly retrievable, "application/json".

2. Include at least one service in the manifest.

3. List all supported capabilities with valid schema URLs.

4. Implement the HTTP surface for every listed capability.

5. Return valid JSON conforming to the referenced schemas.

6. Use the status codes and error format of {{transports}}, except "deviceAuthorizationUrl" and "tokenUrl", which answer errors per {{Section 5.2 of RFC6749}} ({{agent-registration}}).

7. Declare authentication in the manifest, or omit the declaration for public endpoints; an undocumented 401 is non-conformant.

8. Reference every declared service from at least one capability -- in the same manifest or, for a multi-tenant root, in its tenant manifests.

9. Keep every manifest "description" within the length limit and free of mechanics ({{manifest-discipline}}).

10. Publish no second machine-readable or agent-directed description of the service ({{origin-discovery}}).

11. Where "deviceAuthorizationUrl" is declared, carry the sign-in guidance verbatim -- the manifest text as that "authentication" block's "note", the device text as the device answer's "note", the token text at the start of the token answer's "note" -- in the words of the version the manifest declares, or of a later one; and, from 0.9.17, accept "connection" in the device request and give it back as the token answer's "name", keying the "mcp" entry by it ({{agent-registration}}, {{sign-in-guidance}}).

12. Bind a correlation identifier to the sender that first used it, refusing another sender's command naming it with a 400 that names the field ({{correlation}}).

13. Meet each obligation this document marks "(Required from 0.10.0)": the tenants of a credential answered with no "tenant_id" listed at the root, and the end of a credential ({{agent-registration}}); the correlation identifier on every later fact about what a command created ({{correlation}}); a workflows capability "active" only with a recipe ({{workflows}}); a query's "parameters" schema enforced and an event range in RFC 3339 form ({{events}}); and, in Security Considerations, cleartext refused and never carrying a credential, request records without credentials or query strings, and the 413 and 429 answers.

Items 8 to 10, 12 and 13, the pseudo-tenant rule ({{multitenancy}}, rule 5) and accepting "application/cloudevents+json" on "POST /commands" are required from 0.10.0. Each is stated from the release that introduced it (items 8 to 10 from 0.9.11), and validators report its violations as warnings until 0.10.0. Item 11 is required now: it is what keeps a credential out of a transcript and the approval in the person's hands.

Per-capability required endpoints, for capabilities declared "active" ("partial" capabilities are exempt but MUST document their available routes in "endpoints"):

| Capability | Required endpoints |
|---|---|
| io.best.agents.commands | GET /commands, POST /commands |
| io.best.agents.events | GET /events |
| io.best.agents.queries | GET /queries, GET /queries/{schema}/{version}, GET /queries/{schema} |
| io.best.agents.workflows | GET /workflows, GET /workflows/{id} |
{: title="Required endpoints per capability"}

Multi-tenant root manifests additionally follow the rules of {{multitenancy}}.

Conformance does not require any specific language, framework, or architecture; any specific event transport; MCP support; or AI capabilities -- a BEST service can be deterministic or human-operated.

Versioning is semantic (MAJOR.MINOR.PATCH) at the manifest root, per service, and per capability. Consumers MUST ignore unknown fields for forward compatibility. All BEST identifiers use reverse-domain notation; the "io.best." prefix is reserved for this specification.

This document establishes no new IANA registries (see IANA Considerations).

# Implementation Status

This section records the implementation status at the time of writing, per {{RFC7942}}; it is to be removed by the RFC Editor before publication.

Three production deployments of BEST exist -- a fintech trading platform, a business platform and a video studio, implemented as separate codebases -- each exposing discovery, commands, events, and queries over the HTTP binding; the video studio also offers agent registration through the device authorization grant. A further implementation, best-peer (Rust, a BEST service in front of GPU machines), was written from the specification text alone, and every place the text was silent or ambiguous was recorded against the specification. A generic reference MCP server (@behavioralstate/best-mcp, npm) adapts any BEST endpoint for MCP-capable LLM clients and performs agent registration itself, keeping the credential out of the model's view, and a conformance validator (@behavioralstate/best-validate, npm) executes this document's conformance checklist against a live endpoint, including the sign-in guidance. All of these are by the specification's author or the author's organisation. The first implementation independent of the author is in progress: belmontcottage.co.uk, a holiday-rental website whose maintainer is adding a BEST surface to it; it was not yet serving a manifest at the time of writing.

# Security Considerations

TLS:
: Endpoints MUST be served over HTTPS, but for the cleartext this paragraph allows. Cleartext HTTP MAY be used only where both ends are the same machine's loopback, judged on the address a service listens on and the host of the endpoint it advertises, or where its operator states that the network already encrypts the hop. Elsewhere a service MUST refuse to serve in cleartext, not warn, and its refusal MUST name the setting and the fix. A service's own outbound calls that carry a credential follow the same rule: it MUST NOT send one in cleartext but to loopback or over a hop its operator stated encrypted. (The refusal and the outbound rule are required from 0.10.0.) MCP transports MUST provide TLS-equivalent confidentiality. Clients and servers MUST validate certificates and host names and MUST NOT send credentials over a transport this paragraph does not allow.

Authentication surface:
: "GET /.well-known/best" is always unauthenticated. Beyond it, only two things are reachable without a BEST credential: the capabilities of a service that declares "type": "none" (a public surface), and the "deviceAuthorizationUrl" and "tokenUrl" endpoints, which MUST be rate-limited per client and per "device_code". Since "client_id" is the caller's own word, a service SHOULD also bound the registrations pending per network origin, an IPv6 origin by its /64, without reading a forwarded address the caller writes; a refusal SHOULD be a 503 whose Retry-After says when a place frees. A public surface MUST NOT return data belonging to any account and MUST be rate-limited per client; a command accepted on a public surface MUST have no effect on any account until a person signed in to the platform has approved it. "GET /events" MUST require authentication and tenant-scoped authorisation unless a stream is explicitly designated public. Distinct read and write scopes are RECOMMENDED. Because "POST /commands" is a single endpoint through which every named operation is invoked, coarse scopes are insufficient on their own: servers SHOULD enforce per-command authorisation policies per credential, evaluated deny-by-default on every submission.

High-impact commands:
: Commands that are destructive, irreversible, bypass a compliance control, commit a person (open an account, accept terms, start a subscription) or grant access to what is theirs (issue a credential, share a resource, invite a member) SHOULD require a control beyond the submitting credential -- human approval, a second principal, or out-of-band confirmation -- and that control MUST NOT be self-serviceable by the submitting credential. On a public surface there is no submitting credential at all, so the control is the whole of the authorisation: the person signing in to the platform and approving, in their own browser, is the out-of-band confirmation, and the agent cannot perform it. Servers SHOULD declare the "impact" annotation ({{impact}}) on such commands so consumers can discover the obligation; the annotation is advisory to consumers and never substitutes for the server-side control.

Schema-selection SSRF:
: Servers select validation schemas from their own catalogue, keyed by a server-owned identifier. Servers MUST NOT fetch a caller-supplied "dataschema" URI: a caller-controlled fetch is a server-side request forgery vector. Servers SHOULD reject commands whose "dataschema" does not match a catalogue entry.

Replay protection:
: The envelope "id" is an idempotency key. Servers MUST detect and reject or safely ignore duplicates (the same "id" from the same credential) within a retention window, scoped to the authenticated tenant and to the sending credential, and SHOULD state that window in their documentation; a safely ignored duplicate is answered as the original was, and a reused "id" with a different payload MUST return 409.

Untrusted "source":
: The "source" attribute is caller-declared. Servers MUST NOT grant permissions or make security decisions from it, and SHOULD either overwrite it with the verified principal for audit purposes or record both values. Payload fields naming a principal likewise carry no authority.

Identifiers are not secrets:
: A value that names something -- an envelope "id", a "correlationid", a tenant, account or registration identifier -- MUST NOT be accepted as proof of anything; what a credential reads under a correlation identifier follows from who owns it ({{correlation}}), not from naming it. Identifiers are logged, projected and indexed by design. Every secret a service relies on MUST be generated by the service, never minted by the caller: a caller may be a model, and a model cannot produce randomness.

Credentials stay out of transcripts:
: A conversation with a model is not a secret store: it is kept, synced, summarised and shared. A consumer that has a store of its own MUST run the token request outside the model's view, keep the credential there, and redact it from everything it returns to the model. A consumer that has none -- a model making the requests itself -- SHOULD register with "credential_lifetime=session", and a service SHOULD then issue a short-lived credential (hours, with "expires_in"), so that what the transcript holds is soon worthless. The service MUST say all this itself, at each step, in the words of the sign-in guidance ({{sign-in-guidance}}): the consumer is often a model with nothing else to tell it.

The person approves in their own browser:
: The agent gives the person the verification link and MUST NOT open it itself or in a browser it controls: approving is the person's act, and a page the agent drives could approve on their behalf or put their password within its reach.

Name resolution:
: Resolving a name reaches a service nobody configured. The consumer's obligations in {{name-resolution}} -- resolving only a name the person gave or confirmed, saying what it resolved, refusing loopback, link-local and private targets outside development use, binding each credential to its name, and giving a newly resolved service's text no authority -- are what keep a service from redirecting an agent to another one or instructing its client. A name that resolves is a service that exists, not one that is safe; the person's confirmation of the name is the trust decision.

Tenant isolation:
: Tenant context MUST derive from authenticated identity, never from caller-supplied paths, parameters, or payload fields. Caches, deduplication stores, and event streams MUST be isolated per tenant; knowledge of another tenant's identifier grants nothing.

Query-string credentials:
: Long-lived credentials SHOULD NOT ride in URLs, where they leak through request logs, proxies, Referer headers and browser history; URL-only clients bootstrap through the exchange of {{token-exchange}}. Servers accepting any credential in a query parameter MUST NOT write its value to logs, SHOULD send "Cache-Control: no-store" on responses to such requests, and SHOULD issue query-eligible tokens with reduced scope; in particular, a query-borne token SHOULD NOT be able to submit high-impact commands.

Request records:
: A service SHOULD keep a record of the requests it answers that names the verified principal when there is one, refused requests included. It MUST NOT record a credential, a header carrying one, or a query string, which may carry an exchanged token. (Required from 0.10.0.)

Input limits:
: Servers MUST bound request body size, JSON nesting depth, collection sizes, string lengths, and attribute counts. A body over the limit SHOULD be refused with 413 carrying "details.limit_bytes", the largest body the endpoint accepts, and a service that forwards a command to another service MUST accept no body it cannot forward whole (required from 0.10.0). Servers SHOULD rate-limit command submission per authenticated client and per tenant; a server that does MUST answer a command past the limit with 429 and a Retry-After header, MUST NOT count a retry of a command it accepted or a command it refused, and SHOULD count a client once across the tenants it opens (required from 0.10.0).

Event streams:
: A server MAY bound the event streams a client holds open. Past the bound it SHOULD end the client's oldest stream rather than refuse the new one: a client cannot close a stream whose connection it lost, and its reconnect must not be refused by a stream the server still believes open. A service that bounds streams SHOULD state the bound in its documentation.

Manifest content:
: The manifest is publicly retrievable by design. Its content, extension content included, MUST be limited to information intended for unauthenticated disclosure: no internal addresses, credential material, or sensitive integration names. An extension is not a private channel.

Credential passthrough:
: Intermediaries such as MCP servers or gateways forward caller credentials. Passthrough MUST be opt-in per connection and off by default, credentials MUST be forwarded only to the configured endpoint and never logged, explicit per-request credentials take precedence over ambient ones, and multi-user intermediaries SHOULD fail closed.

# IANA Considerations

This document has no IANA actions.

The protocol uses the well-known URI path prefix "/.well-known/best" ({{RFC8615}}). The "best" suffix is not registered in the "Well-Known URIs" registry: a provisional registration was requested in August 2026 and declined by the designated expert, under the registry's policy that single common words and short terms are registrable only by recognised standards development organisations. The suffix is therefore used without registration. Registration in that registry serves collision avoidance rather than being a precondition for use; readers should nonetheless be aware that unregistered use carries a collision risk, mitigated in practice by the same policy preventing other registrants from claiming the suffix. The author intends to pursue registration again should this specification be adopted within the IETF.

The protocol also uses the underscored DNS node name "_best" for the TXT record of {{name-resolution}}. It is not registered in the "Underscored and Globally Scoped DNS Node Names" registry.

This document establishes no new registries.

--- back

# Acknowledgments
{:numbered="false"}

The BEST envelope is a profile of CloudEvents, the protocol's discovery model follows the well-known URI convention of RFC 8615, and agent registration is the OAuth 2.0 Device Authorization Grant; the author thanks the communities behind all three. Feedback from the operators of the early production deployments, and the gaps an implementation written from the text alone exposed, shaped the correlation, multi-tenancy, registration and authorisation requirements in this document.
