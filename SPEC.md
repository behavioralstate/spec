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
- [Identity and Agent Registration — a described pattern](#identity-and-agent-registration--a-described-pattern)
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

**Agent-operable, from a name alone.** BEST's aim is that a person can say "use example.com" to an agent that has never heard of it, and the agent gets from that name to working use by itself: it resolves the name, reads the manifest, learns what each surface needs, obtains the credential it lacks, and operates. The person's part is reduced to what only a person can do: say what they want and — once, in their own browser — sign in or sign up, and approve the agent. Everything else is the agent's, and everything the agent needs is in the manifest and the catalogues, in structure rather than in prose. A service that needs no authentication at all is the simplest case of the same thing.

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
8. **Operable blind** — a consumer that ignores every `description` and `guidance` string can still find every surface, know what opens it, and invoke every operation with schema-valid data. Prose tells a model what an operation *means*; it never carries where something is, what credential opens it, or what it is called.

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

**Commands, and what stays behind the edge.** CloudEvents describes events — facts, which have an origin and no destination. BEST also carries commands in the same envelope, and a command has a destination; CloudEvents has no attribute for it and BEST adds none: the destination is the endpoint the command is posted to, and within it the server routes by `type`. `source` is always the caller's declared origin, never a routing key. A service is free to use any internal envelope or dialect — its own routing keys, its own use of identifiers — behind an edge that accepts the conformant envelope and maps it. Nothing of that dialect is ever required from a caller or shown to one: no internal component name in a published schema, no internal identifier a caller must supply that the server can derive from the credential, and on the wire `correlationid` always means what the [envelope table](#wire-format--the-best-envelope) says it means.

## Discovery — `/.well-known/best`

Every BEST endpoint exposes:

```
GET /.well-known/best
Content-Type: application/json
```

This endpoint is **always public** — an implementation that requires auth on it is non-conformant. The path is canonical; `/.well-known/best.json` may be served as an optional alias, but consumers must not rely on it.

Schema: [`discovery.json`](protocol/v1/schemas/discovery.json) · Full example: [`well-known-best.json`](protocol/v1/examples/well-known-best.json)

### Origin Discovery

The manifest above solves *endpoint* discovery — a consumer that already holds the BEST endpoint's URL learns everything else from it. It does not, by itself, solve *origin* discovery: an agent pointed at a product's public web origin (`https://example.com`) has no defined path to the BEST endpoint, which commonly lives on another host (`https://api.example.com`).

A deployment whose BEST endpoint is not the public web origin **should** bridge the gap:

1. **Serve `/.well-known/best` on the public origin.** Either return the manifest directly, or redirect (`301`/`308`) to the canonical manifest on the API host. Consumers **must** follow redirects on this path; the redirect target is the canonical endpoint for all subsequent interaction. The origin copy keeps the same public/no-auth requirement as the canonical one.

   ```
   https://example.com/.well-known/best
                 │ 308
                 ▼
   https://api.example.com/.well-known/best
   ```

2. **Advertise the bridge in the origin's HTML**, so agents that fetch the page discover the manifest without prior BEST knowledge:

   ```html
   <link rel="alternate" type="application/json"
         href="/.well-known/best" title="BEST service manifest">
   ```

**The manifest is the only entry.** A deployment points at its manifest — the well-known path, the redirect, the HTML `<link>` — and **must not** publish a second description of its BEST surface for agents to start from: no `llms.txt` restating operations, no skill or prompt file, no client snippet carrying behaviour, no OpenAPI document of the BEST endpoints. A consumer that has the name has everything; anything else it is handed is a copy that will disagree with the manifest the first time the service changes. *(Required from 0.10.0; until then a violation is reported as a warning.)*

**What a site shows the person.** A site's own "connect your assistant" page **may** give the person a sentence naming the service and the person's act — `Sign me in to <name>`, or `Sign me up on <name>` where the platform lets people sign up — where `<name>` is a name the service is publicly known by. It **must not** append URLs, tenant IDs or steps: the name is the whole instruction ([Name Resolution](#name-resolution)), and anything added is a second agent-directed description. A name that does not resolve yet is fixed with the bridge above, never with a longer sentence. **Required from 0.10.0.**

With the bridge in place, "point an agent at `https://example.com`" is a complete instruction: origin → manifest → commands, queries and events, with no scraping and no out-of-band configuration.

### Name Resolution

A BEST service is **named by a DNS domain name its operator controls** (`example.com`). That is the whole namespace: BEST defines no registry, no directory and no identifier of its own for "which service". A person says "sign me in to example.com"; a consumer that has never heard of the service turns that name into a manifest with the algorithm below, and everything else follows from the manifest. DNS already supplies what a registry would have to rebuild — unique names, proof of ownership, delegation, revocation when a name lapses — and a resolver on every machine.

**Resolving a name.** Given a name `N`, a consumer:

1. **Normalises it.** A URL is reduced to its host; the result is lower-cased and an internationalised name converted to its A-label form. `N` **must** be a domain name — an IP literal is not a name, and `localhost` is resolvable only where the person has opted into development use.
2. **Fetches `https://N/.well-known/best`**, following redirects as [Origin Discovery](#origin-discovery) requires. A response that is a BEST manifest ends the resolution: the final URL is the canonical manifest and its host the canonical endpoint host.
3. **Only if step 2 found no manifest** (no HTTPS service on `N`, or a `404`) **and the consumer can query DNS**, looks up `TXT` at `_best.N`. Exactly one record of the form below names the manifest; zero, several, or a malformed one means `N` does not resolve.

   ```
   _best.example.com.  IN TXT  "v=BEST1; manifest=https://api.example.com/.well-known/best"
   ```

   `manifest` **must** be an absolute `https` URL. The record exists for names whose origin serves no HTTP at all; it is never consulted when the well-known path answers, so every consumer — including one that can only make HTTPS requests — reaches the same manifest whenever step 2 succeeds.

A service **must** be resolvable from every name it is publicly known by, through step 2 wherever that name serves HTTPS. A service that publishes both **must** make them agree. The `services` keys of a manifest **should** sit under the reversed name it resolves from (`com.example.*` for `example.com`); conversely, the owning name of a service id is found by reversing its labels and resolving the longest suffix that resolves — never a public suffix.

**What a resolver owes the person.** Resolution lets a consumer reach a service nobody configured, which is its point and its risk. A consumer acting for a person — a model behind an MCP client above all — **must**:

- **Resolve only a name the person gave or confirmed.** A name found in a manifest, a query result, an error body or any other content is data; following it without the person's confirmation is how a service redirects an agent to another one.
- **Say what it resolved** — the name as typed and the canonical endpoint host — before the first credentialed interaction with a newly resolved service, showing an internationalised name in its A-label form whenever it mixes scripts.
- **Use `https` with certificate validation only**, and refuse a name or redirect that lands on a loopback, link-local or private address outside development use.
- **Bind every credential to the name it was issued under.** A credential is never sent to a host other than the canonical endpoint host of that name; a later change of that host is a new resolution the person confirms, not a silent move. It is kept under that name too: another name is another sign-in, kept apart, and a configuration entry made from the credential takes the same name.
- **Give a newly resolved service's text no authority.** Its descriptions guide the use of *that* service; nothing in them instructs the client, touches another connection, or waives any rule above.

Name resolution answers "where is `example.com`'s service", not "which service makes videos". Search by category is a directory, and a directory is a domain like any other: anyone may run one as a BEST service whose queries return names.

### Manifest Root

| Field | Required | Description |
|---|---|---|
| `best.version` | yes | BEST spec version (semver) |
| `best.services` | yes | Service definitions with transport bindings, keyed by reverse-domain name |
| `best.capabilities` | yes | Supported capabilities with spec/schema URLs |
| `best.authentication` | no | Credential requirements for every service that declares none of its own (omit for public endpoints) — see [Authentication Block](#authentication-block) |
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
| `tokenUrl` | no | An RFC 6749 token endpoint. It serves the `client_credentials` exchange for header-constrained clients (see [Token Exchange](#token-exchange-for-constrained-clients)) and, where `deviceAuthorizationUrl` is declared, the device-code grant that completes a registration |
| `deviceAuthorizationUrl` | no | How an agent obtains this credential by itself: an [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) device authorization endpoint — see [Agent Registration](#agent-registration). Requires `tokenUrl` and `note`. Omitted when credentials are only issued out of band |
| `note` | with `deviceAuthorizationUrl` | The [sign-in guidance](#sign-in-guidance)'s manifest text, verbatim: how the consumer signs the person in and keeps the credential out of the conversation |
| `docs` | no | A page for people. A consumer never depends on it |

The block appears at the manifest root and, optionally, on a [service entry](#services-and-transport-bindings), where it governs that service alone.

Consumers **must** read this block before calling anything else. A consumer that holds no credential for a surface registers through `deviceAuthorizationUrl` when it is present; only when it is absent does it ask the person for a credential obtained out of band. The block's `note` says how, step by step ([Sign-in Guidance](#sign-in-guidance)).

### Token Exchange for Constrained Clients

Some legitimate clients cannot set HTTP headers — URL-only integrations, webhook targets, legacy tooling. The escalation path is: prefer headers; fall back to a body-based token exchange; only then to a query parameter carrying a **short-lived** token. The long-lived credential never appears in a URL.

| Client can | Mechanism |
|---|---|
| Set headers | `Authorization: Bearer <token>` or the `apiKey` header — always preferred |
| POST a body, but not set custom headers | Exchange the long-lived credential at `tokenUrl` for a short-lived token |
| Only control a URL | Send the **exchanged short-lived token** as the `access_token` query parameter per [RFC 6750 §2.3](https://www.rfc-editor.org/rfc/rfc6750#section-2.3) |

When `type` is `"oauth2"`, `tokenUrl` names an [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) token endpoint. Hosts intending to serve header-constrained clients **should** accept the `client_credentials` grant — a form-encoded `POST` requiring no custom headers — and return `access_token`, `token_type`, and `expires_in` per RFC 6749 §5.1. Exchange-issued tokens **should** be short-lived (minutes, not days), and tenant context derives from the credential itself, never from a tenant identifier submitted alongside it. Declaring `apiKey` with `in: "query"` for a **long-lived** credential **should not** be done — offer the exchange instead. Full normative rules: [Security Requirements](#security-requirements) and [specs/security.md](specs/security.md#token-exchange-and-query-string-credentials).

### Agent Registration

A service that lets an agent obtain its own credential declares `deviceAuthorizationUrl` and `tokenUrl`. The exchange is [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628), unchanged; BEST adds two request parameters (`agent_label`, `credential_lifetime`), two members of the token answer (`tenant_id`, `auth_header`), the [credential block](#agent-registration) that comes with the credential, and the [sign-in guidance](#sign-in-guidance): the words, fixed by this specification, that tell the consumer at each step what to do.

**1. The agent asks.** A form-encoded `POST` to `deviceAuthorizationUrl`, with no credential:

| Parameter | Required | Description |
|---|---|---|
| `client_id` | yes (RFC 8628) | The name of the consumer software (`best-mcp`, `claude`). BEST services pre-register no clients: the value is caller-declared and, like `source`, never identity. |
| `agent_label` | no | What the approver reads when asked to admit this agent — recognisable to them ("Claude on Ada's phone"). |
| `credential_lifetime` | no | `durable` (default) or `session`. A consumer that cannot keep a secret out of a conversation sends `session`. The value only ever lowers what is issued. |

**2. The service answers at once** (RFC 8628 §3.2): `device_code`, `user_code`, `verification_uri`, optionally `verification_uri_complete`, `expires_in`, `interval`. The `device_code` is **generated by the service**, unguessable, and is neither derived from nor usable as any identifier — not an envelope `id`, not a `correlationid`, not an account or registration id. The answer also carries `note`: the device text of the [sign-in guidance](#sign-in-guidance), verbatim.

**3. The agent gives the person `verification_uri_complete` (or `verification_uri` and `user_code`) before anything else**, to open in their own browser. It **must not** open the link itself or in a browser it controls: approving is the person's act, and a page the agent drives could approve for them or put their password within its reach. It polls `tokenUrl` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and its `device_code`, no faster than `interval`. `authorization_pending` and `slow_down` are not errors; `access_denied` and `expired_token` end the registration (RFC 8628 §3.5).

**4. On approval the token endpoint answers** per RFC 6749 §5.1 — `access_token`, `token_type`, and `expires_in` when the credential is not durable — with two BEST members: `tenant_id`, the account the credential opens, and `auth_header`, the header that carries it when that is not `Authorization`. A `device_code` is redeemed once.

**The credential block.** The same answer carries what the consumer needs to decide what to do with the credential — because the consumer is often a model making the requests itself, and this answer is the only thing that reaches it with the credential:

| Member | Required | Description |
|---|---|---|
| `note` | yes | Begins with the token text of the [sign-in guidance](#sign-in-guidance), verbatim: the credential is a **secret**, kept in the client's configuration or credential store and never repeated in the conversation — in a message, a command or any output. A service may add to it after that text (where a person can mint a credential themselves, how to use this one). |
| `endpoint` | yes | The surface the credential opens (the tenant endpoint on a multi-tenant host), on the canonical endpoint host |
| `manifest` | no | That surface's manifest |
| `ready_check` | no | A read that answers `200` once the credential works |
| `mcp` | no | This connection as an MCP client's configuration (for the reference MCP server: `command`, `args`, `env`) — the credential in its `env` — as **one entry named after the address of the manifest the credential came from**: its host, and its path when that manifest is not at the root. The consumer keeps it under the name the person gave the service ([Name Resolution](#name-resolution)), which is that host whenever they gave none |
| `http` | no | The surface for direct calls: the header with a **placeholder** for the credential (`X-Api-Key: <access_token>`), and the catalogue URLs, on the canonical endpoint host |

The consumer chooses: an MCP-capable client writes `mcp` into its own configuration, one without MCP keeps the credential for direct calls, and a client with its own store keeps it there and redacts it from everything the model sees, as always ([Credentials stay out of transcripts](#security-requirements)). The credential appears only in `access_token` and in `mcp` — never in `note`, `http` or any example.

**Every destination in the block is on the credential's host.** Each URL the credential may be sent to — `endpoint`, the URLs in `http`, the base URL in `mcp` — **must** be on the canonical endpoint host of the name the consumer resolved, and a consumer **must not** send the credential to one that is not ([Name Resolution](#name-resolution): a credential is never sent to a host other than the canonical endpoint host of its name). A page for people (`docs`) may be elsewhere; the credential never goes there.

**Errors.** `deviceAuthorizationUrl` and `tokenUrl` answer errors per [RFC 6749 §5.2](https://www.rfc-editor.org/rfc/rfc6749#section-5.2) — for the device endpoint by [RFC 8628 §3.2](https://www.rfc-editor.org/rfc/rfc8628#section-3.2), which answers errors "in the same way as the token endpoint" — not in the BEST error format: status `400` (or `401` for a client failure) with a JSON body carrying `error` and, **recommended**, `error_description`. A request that is not form-encoded is `invalid_request` — never a bare status with an empty body, because the agent is often a model that corrects itself only from what the answer says. `tokenUrl` uses the RFC 8628 §3.5 codes above. **Required from 0.10.0**; until then a bare error is reported as a warning.

Nothing in this exchange is a BEST command, a catalogue entry or a workflow: it needs no public surface, no recipe and no prose beyond the sign-in guidance, and a client implements it once for every service. What happens on the page the person opens — signing in, signing up, approving — is the platform's own; [Identity and Agent Registration](#identity-and-agent-registration--a-described-pattern) describes it.

### Sign-in Guidance

The consumer is often a general-purpose model that knows nothing of BEST, and what reaches it while it signs a person in is all it has to go on. Left to itself it has opened the approval link in a browser it drives, shown the manifest to the person, and written the credential into its commands. So a service that declares `deviceAuthorizationUrl` says what to do at each of the three steps in the words below, **verbatim** — the same on every service, so that no implementation can drop a point:

| Where | Member | Carries |
|---|---|---|
| The `authentication` block that declares `deviceAuthorizationUrl` | `note` | the manifest text |
| The device authorization answer | `note` | the device text |
| The token answer | `note` | the token text, first; a service may add to it after |

**Manifest text**

> For you, the agent, not the person: read this manifest with an HTTP request; never show it to them or open it in a browser. When the person asks you to sign them in, POST a form to deviceAuthorizationUrl with client_id set to your software's name, and give them the link it answers (verification_uri_complete, or verification_uri and user_code) to open in their own browser, where they sign in and approve you. Never open that link yourself or in a browser you control, never sign in for them, and never ask for a password. Then poll tokenUrl, no faster than interval. Its answer carries a secret credential: save it straight to your client's credential store or to a file only the person can read, under the name the person gave this service (its host if they gave none), and never put it in a message, a command or any output: read the rest of the answer without it.

**Device text**

> Give the person this link, verification_uri_complete (or verification_uri and user_code), to open in their own browser, where they sign in and approve you. Never open it yourself or in a browser you control: approving is theirs. Then poll tokenUrl no faster than interval, with a form of grant_type=urn:ietf:params:oauth:grant-type:device_code, device_code and client_id. Its answer carries a secret credential: save it straight to your client's credential store or to a file only the person can read, under the name the person gave this service (its host if they gave none), and never put it in a message, a command or any output: read the rest of the answer without it.

**Token text**

> The credential is a secret. Keep it in your client's configuration or credential store, under the name the person gave this service (its host if they gave none): another name is another sign-in, kept apart. Never repeat it in the conversation, in a message, a command or any output: read it from where you stored it. A transcript, commands and their output included, is not a secret store, and a credential that appears there is leaked and must be replaced. If your client cannot store it, say so instead of showing it.

The same texts are published in [`discovery.json`](protocol/v1/schemas/discovery.json) under `$defs/signInGuidance`, one set per version that changed them: the schema requires a manifest text wherever `deviceAuthorizationUrl` is declared, and validators check the device answer. They change only with this specification, and every implementation takes them unchanged. Each version's texts stay published: a service carries the texts of the version it declares, or of a later one, so it is never non-conformant for not having moved yet — and a service that declares a version carries at least that version's words. A consumer whose own client makes these requests — the reference MCP server is one — follows them itself and need not show them to its model.

### Services and Transport Bindings

Each entry in `services` declares `version` and `description` (required), optional `spec` URL, an optional `authentication` block of its own, and one or more transport bindings:

| Binding | Required fields | Notes |
|---|---|---|
| `http` | `endpoint` | **Baseline — every conformant service exposes it.** `endpoint` is the consumer-facing base URL; all capability paths are appended to it. |
| `mcp` | `transport` (`stdio`/`sse`/`http`), `server` | Optional. May carry its own `authentication` block and `push: true`. See [MCP Transport](#mcp-transport). |

Multiple transports expose the **same capability surface** — they are alternative access methods, never separate operation sets.

**Surfaces with different access.** A service entry **may** carry its own `authentication` block, of the same shape as the root block. When present it governs every capability that service implements and the root block does not apply to them; when absent the root block applies. `"type": "none"` declares a **public surface**: its capabilities are callable without a credential.

```json
"authentication": { "type": "apiKey", "scheme": "X-Api-Key", "in": "header" },
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
```

A surface is an ordinary service with ordinary capabilities: what it offers is discovered from its catalogues like anywhere else. Where a credential itself identifies the scope it opens — a share token, a per-project key — the endpoint carries no scope identifier: context derives from the credential, as [Security Requirements](#security-requirements) already requires of tenants.

### Capability Entries

| Field | Required | Description |
|---|---|---|
| `name` | yes | Reverse-domain capability name. `io.best.*` is reserved for the spec; custom capabilities use an implementer-owned prefix (`com.acme.inventory`). |
| `version` | yes | Semver |
| `description` | yes | Human-readable summary |
| `spec` | io.best.* only | URL to the capability specification page (optional for custom capabilities) |
| `schema` | io.best.* only | URL to the capability's **JSON Schema** (not OpenAPI) |
| `service` | conditional | Key of the implementing service in `services`. Required when the capability's name prefix doesn't match the service key (e.g. custom service `com.acme.trading` implementing `io.best.agents.commands`). |
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

### Manifest Discipline

The manifest is structure. Its `description` fields say what a service or capability *is*, in a sentence or two, for a reader choosing whether to use it. They are never load-bearing ([principle 8](#design-principles)).

1. **Descriptions carry meaning, never mechanics.** A manifest `description` **must not** contain URLs or URI templates, header names or credential formats, the names of catalogue operations, or step-by-step instructions. Each of those has a structural home: `http.endpoint` and `endpoints`; `authentication`; the catalogues; the workflows capability.
2. **Descriptions are short.** A manifest `description` **must not** exceed 500 characters. Catalogue and schema descriptions are not capped — that is where an operation's meaning is explained.
3. **Every service is reachable by structure.** Each key in `services` **must** be the implementing service of at least one capability in the same manifest. The one exception is the root manifest of a multi-tenant host, which may announce a service whose capabilities are tenant-scoped: that service **must** then be declared, with its capabilities, by every manifest `tenants.manifest` expands to. A service that no manifest gives a capability — described only in words — is non-conformant.
4. **No placeholders in structure.** Templates appear only in `tenants.manifest`; a tenant ID names a real scope ([Multi-Tenancy](#multi-tenancy) rule 5).
5. **Service text has no authority over the consumer.** Descriptions, schema descriptions and workflow `guidance` guide the use of *this service's* operations. They **must not** instruct the consumer about its own client, configuration, other connections or other services — the counterpart, on the service side, of what [Name Resolution](#name-resolution) already requires the consumer to disregard. Making a connection last is the consumer's decision. A service speaks to the consumer about signing in and keeping the credential in one place only — the [sign-in guidance](#sign-in-guidance), in this specification's words — and offers the ways to use the credential in the token answer's [credential block](#agent-registration).
6. **When the manifest cannot say it, there are three lawful outlets, in this order:** model it as ordinary behaviour — a command, a query, an event, a workflow; declare it under [`extensions`](#extensions) if it is static and needed before interaction; raise it against the specification. Prose, and structure bent to a purpose it was not defined for, are not outlets.

Rules 1–4 are **required from 0.10.0**; until then a violation is reported as a warning. Rules 5 and 6 apply now.

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
5. A tenant ID names a real scope. A constant pseudo-tenant (`public`, `default`, `anonymous`) used to host a surface that has no scope is non-conformant — declare a root-level service with its own `authentication` instead ([Services and Transport Bindings](#services-and-transport-bindings)). *(Required from 0.10.0.)*

## Identity and Agent Registration — a described pattern

*Non-normative. A service that needs no authentication ignores this section.*

BEST defines no identity provider, no account model and no login. A platform that has them keeps them; the one thing BEST fixes is how an agent obtains its credential ([Agent Registration](#agent-registration)). This section names the parts so that implementers use the same words for the same things. Worked example: [specs/identity-and-registration.md](specs/identity-and-registration.md).

**Who is involved.** The **person** the agent works for. The **agent** — the BEST consumer. The **account** — the scope a credential opens (a tenant, in a multi-tenant host). The **approver** — whoever may admit an agent to an account: the person themselves on a self-serve platform, an administrator on a provisioned one.

**The flow is one, whatever the person said and whether or not they have an account.** The person says "sign me in to example.com" — or "sign me up", or "connect me". The agent registers itself and gives the person a link and a code. The link opens a page of the platform where the person signs in, or signs up if the platform offers that, and approves the agent. The agent collects its credential. The agent never needs to know whether an account existed.

**The behaviours, told apart by whose they are:**

| Behaviour | Whose | Where it happens |
|---|---|---|
| **Register agent** | the agent's | the device authorization request ([Agent Registration](#agent-registration)) — not a BEST command |
| **Sign in** | the person's | the platform's own page, reached from the link the agent shows |
| **Sign up** *(where the platform offers it)* | the person's | the same page; it is also where the account is opened |
| **Approve agent** | the approver's | the same page, once signed in |
| **Revoke agent** | the agent's, or the approver's | a command under that credential; or the platform's UI |
| **Sign out** | the person's | the platform's own UI; it ends the person's browser session and touches no agent credential |

**Keep them apart.** Signing in, up and out belong to the person and happen on the platform's pages, with its identity provider: the agent never sees a password, never performs or simulates them, and no BEST operation or workflow is named after them. Registering and revoking belong to the agent and are named as such: an operation that revokes a key is a revocation, not a sign-out. Ending the person's session leaves every agent credential alive; revoking a credential leaves the person's session alive.

**The flow**, seen from both sides:

1. The agent posts to `deviceAuthorizationUrl` and at once holds a secret the service generated, and a link and a short code for the person.
2. **The agent gives the person the link and the code before anything else**, to open in their own browser; it never opens the link itself. Until the person acts, nothing else can happen.
3. The person opens the link. The page lets them sign in — or sign up, where the platform offers it — and then approve the agent. Nothing the agent sent has any effect without that, and unapproved, the registration expires.
4. Meanwhile the agent polls `tokenUrl`. On approval the answer is the **credential and the account's identifier** — and from that, the account's manifest: everything the next request needs.

Whether a person without an account can get one is the page's business, not the agent's: a self-serve platform offers sign-up there, a platform with provisioned accounts offers sign-in only and its approver may be an administrator. The agent's flow is the same in both. A platform may equally offer none of this and issue credentials out of band — it then omits `deviceAuthorizationUrl`.

**Where the credential lives is the consumer's business, and only the consumer knows.** A client with its own store — the reference MCP server is one — makes the token request itself, keeps the credential where the model never sees it, and has it again at every later start: the person registers once. An agent with no such client — a model in a chat making HTTP requests — has nowhere to put a secret but the conversation. It registers with `credential_lifetime=session`; the approval page tells the person what is being granted ("until you revoke it", or "for eight hours"); and what it receives is short-lived, so the next conversation starts with a new link and code rather than with a key left in an old one. Whatever the consumer, the [sign-in guidance](#sign-in-guidance) tells it at every step that the credential is a secret, and the token answer's [credential block](#agent-registration) offers both ways to use it — configuring an MCP client, or direct calls; which one, and whether the connection lasts, is the consumer's decision.

**Revoke agent** is an ordinary command on the account's surface, sent under the credential being revoked. After it, that credential receives `401`, and the way back is the one the manifest declares.

**Optional, and outside this flow:** a platform may let an agent open an account itself. That is an ordinary command carrying [`impact: commitment`](#impact-annotations), confirmed with the person before it is sent; nothing above depends on it.

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
      "commandType": "ProposeCounter",
      "dataschema": "https://api.example.com/commands/propose-counter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `schema` | yes | Command schema name in **kebab-case** — the `{schema}` path segment. Distinct from the envelope `type`, which `commandType` states. |
| `version` | yes | Schema version (`1.0`, `2.1`) — first-class, no URI parsing needed |
| `commandType` | no | The exact envelope `type` to send for this command (`ProposeCounter`). When absent, consumers derive it as the PascalCase form of `schema`; servers **should** state it, because a derivation is a guess. Like `workflows` and `impact` it is carried on **both** surfaces — the catalogue entry and the schema document, as a top-level member with the same value. (It cannot be called `type` there: JSON Schema owns that keyword.) |
| `dataschema` | yes | Resolvable URI to the JSON Schema for `data` — the canonical value for a command's `dataschema` field. Resolves to `GET /commands/{schema}/{version}` on this same surface. |
| `description` | no | What the command does |
| `workflows` | no | Ids of [published workflows](#workflows--iobestagentsworkflows) this command participates in — servers **should** populate it for every operation that appears in a recipe |
| `impact` | no | [High-impact annotation](#impact-annotations) — declares that the command is high-impact and that a human-facing consumer must warn and confirm before submitting |

### Impact Annotations

Some commands do not share a blast radius with the rest of the catalogue: the person the consumer acts for would want to be asked first. They move money, destroy data, cannot be undone — or commit the person to something, or let someone new into what is theirs. The [Security Requirements](#security-requirements) already oblige servers to place extra controls on such commands — but until a client can *discover* which commands those are, only the server side of the obligation is implementable. The optional **`impact`** annotation closes that gap:

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

The annotation is not about money. A command that commits the person carries it just the same:

```json
{
  "schema": "open-account",
  "version": "1.0",
  "dataschema": "https://api.example.com/commands/open-account/1.0",
  "description": "Open an account for the person the caller acts for",
  "impact": {
    "categories": ["commitment"],
    "confirmation": "required",
    "warning": "Opens an account in your name under the terms at example.com/terms. The free plan applies until you choose another."
  }
}
```

| Field | Required | Description |
|---|---|---|
| `categories` | yes | What kind of impact — named values: `financial` (moves money or puts capital at risk), `destructive` (removes data or state), `irreversible` (no compensating command), `compliance` (bypasses or alters a compliance control), `commitment` (binds the person: opens an account, accepts terms, starts a subscription, creates personal data in their name), `access` (grants a principal access to what belongs to the person: issues a credential, shares a resource, invites a member). The vocabulary is open; consumers treat unknown values as high-impact. |
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

`guidance` is bound by [Manifest Discipline](#manifest-discipline) rule 5: it speaks about this service's steps only, and never tells the consumer what to do with its own client or configuration.

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

`POST /commands` carries one BEST envelope in the CloudEvents *structured* content mode. Servers **must** accept `Content-Type: application/cloudevents+json` and, for compatibility, `application/json`; consumers **should** send the former. With it, a CloudEvents SDK's HTTP sender produces a valid BEST request unchanged. *(Accepting `application/cloudevents+json` is required from 0.10.0.)*

**Path resolution:** every capability path is appended to the service's `http.endpoint`. The leading slash is a separator, not a root-relative indicator:

| `http.endpoint` | Path | Resolved |
|---|---|---|
| `https://app.example.com/` | `/commands` | `https://app.example.com/commands` |
| `https://api.example.com/tenants/acme` | `/commands` | `https://api.example.com/tenants/acme/commands` |

`http.endpoint` **must** be the consumer-facing public address — never an internal backend or service-mesh URL.

**Authentication:** per the `authentication` block governing the service (its own, else the root's) — `bearer` → `Authorization: Bearer <token>`; `apiKey` → header or query parameter named in `scheme`. `GET /.well-known/best`, the capabilities of a service that declares `"type": "none"`, and the `deviceAuthorizationUrl` and `tokenUrl` endpoints need no credential; everything else does when one is declared.

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
| 401 | Missing/invalid credentials (only when the governing `authentication.type` is not `none`) |
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

**1. Fetch the root manifest** — `GET /.well-known/best` (always public). Extract `authentication` — the root block and any a service declares for itself — and `tenants.manifest` before anything else. Where a block declares `deviceAuthorizationUrl`, its `note` is the [sign-in guidance](#sign-in-guidance): follow it. The manifest is for you, not the person — never show it to them or open it in a browser.

**2. Identify the manifest type and collect prerequisites — before making any authenticated request:**

| Root manifest shows | Meaning | Collect from the user |
|---|---|---|
| `capabilities` contains `io.best.agents.commands` | Direct service | Nothing, if you hold a credential or the surface is public. Otherwise register through `authentication.deviceAuthorizationUrl`; ask the person for a credential only when it is absent |
| `tenants.manifest` present, no commands capability | Multi-tenant router | Same. A completed registration yields the credential **and** the tenant ID together — never ask the person for a tenant ID the registration can give you. Only where no `deviceAuthorizationUrl` is declared: credentials and tenant ID, in one prompt |
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
6. Use standard HTTP status codes and the BEST error format — except `deviceAuthorizationUrl` and `tokenUrl`, which answer errors per RFC 6749 §5.2 ([Agent Registration](#agent-registration))
7. Declare authentication in the manifest (or omit for public) — never an undocumented `401`
8. Reference every declared service from at least one capability — in the same manifest or, for a multi-tenant root, in its tenant manifests
9. Keep every manifest `description` within the length limit and free of mechanics ([Manifest Discipline](#manifest-discipline))
10. Publish no second machine-readable or agent-directed description of the service ([Origin Discovery](#origin-discovery))
11. Where `deviceAuthorizationUrl` is declared, carry the [sign-in guidance](#sign-in-guidance) verbatim — the manifest text as that `authentication` block's `note`, the device text as the device answer's `note`, the token text at the start of the token answer's `note` — in the words of the version the manifest declares, or of a later one

Items 8–10 are **required from 0.10.0**; 0.9.11 states them and validators report violations as warnings, so that every implementer has one version of grace. Item 11 is required now: it is what keeps a credential out of a transcript and the approval in the person's hands.

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
- **Auth** — `GET /.well-known/best` is always unauthenticated; beyond it, only the capabilities of a service that declares `"authentication": { "type": "none" }` are, along with the `deviceAuthorizationUrl` and `tokenUrl` endpoints, which are rate-limited per client and per `device_code`. A public surface **must not** return data belonging to any account and **must** be rate-limited per client. A command accepted on a public surface **must** have no effect on any account until a person signed in to the platform has approved it. `GET /events` requires auth and tenant-scoped authorisation unless explicitly public. Distinct Read/Write scopes are recommended.
- **`dataschema` SSRF** — servers select validation schemas from their own catalogue keyed by `type`; they **must not** fetch caller-supplied `dataschema` URIs, and **should** reject commands whose `dataschema` doesn't match a catalogue entry.
- **Replay protection** — envelope `id` is an idempotency key; duplicates rejected within a retention window, scoped to the authenticated tenant/sender; same `id` + different payload → `409`.
- **`source` is untrusted** — caller-declared; never grant permissions or make security decisions from it; overwrite with (or record alongside) the verified principal for audit.
- **High-impact commands** — commands that are destructive, irreversible, bypass a compliance control, commit a person or grant access to what is theirs **should** require a control beyond the submitting credential (human approval, a second principal, out-of-band confirmation); that control **must not** be self-serviceable. On a public surface there is no submitting credential at all, so the control is the whole of the authorisation: the person signing in to the platform and approving, in their own browser, is the out-of-band confirmation, and the agent cannot perform it. Servers **should** declare the [`impact` annotation](#impact-annotations) on such commands so consumers can discover the obligation; the annotation never substitutes for the server-side control.
- **Identifiers are not secrets** — a value that names something (an envelope `id`, a `correlationid`, a tenant, account or registration identifier) **must never** be accepted as proof of anything. Identifiers are logged, projected and indexed by design. Every secret a service relies on is generated by the service, never minted by the caller: a caller may be a model, and a model cannot produce randomness.
- **Credentials stay out of transcripts** — a conversation with a model is not a secret store: it is kept, synced, summarised and shared. A consumer that has a store of its own **must** run the token request outside the model's view, keep the credential there, and redact it from everything it returns to the model. A consumer that has none — a model making the requests itself — **should** register with `credential_lifetime=session`, and a service **should** then issue a short-lived credential (hours, with `expires_in`), so that what the transcript holds is soon worthless. The service **must** say all this itself, at each step, in the words of the [sign-in guidance](#sign-in-guidance): the consumer is often a model with nothing else to tell it.
- **The person approves in their own browser** — the agent gives the person the verification link and **must not** open it itself or in a browser it controls: approving is the person's act, and a page the agent drives could approve on their behalf or put their password within its reach. The sign-in guidance says so at each step.
- **Tenant isolation** — tenant context derives from authenticated identity, never from caller-supplied paths/params/fields; caches, dedup stores, and streams isolated per tenant; guessing a tenant ID grants nothing.
- **Credential passthrough** (intermediaries such as MCP servers or gateways) — opt-in per connection, off by default; forward only to the configured endpoint; explicit per-request keys take precedence over ambient bearer tokens; never log credentials; multi-user intermediaries should fail closed.
- **Query-string credentials** — long-lived keys should not ride in URLs (logs, referrers, history). URL-only clients bootstrap via the RFC 6749 exchange at `tokenUrl` (`client_credentials`, short-lived output) and send the result per RFC 6750 §2.3; servers never log query-borne tokens, mark those responses `no-store`, and should deny them high-impact commands. Tenant context binds to the exchanged credential, never to a caller-supplied tenant field.
- **Input limits** — bound body size (`413`), JSON depth, collection sizes, string lengths; rate-limit per client and per tenant.
- **Manifest hygiene** — the public manifest carries only information intended for unauthenticated disclosure; no internal addresses, credential hints, or sensitive integration names. This applies to [`extensions`](#extensions) content identically — an extension is not a private channel.
