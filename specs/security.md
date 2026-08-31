# Security Considerations

BEST is an open protocol with a broad attack surface. This page catalogues the security requirements that every conformant implementation must observe.

## TLS

All BEST HTTP endpoints **MUST** be served over HTTPS. Cleartext HTTP **MUST NOT** be used in production. Any MCP transport carrying BEST traffic or credentials **MUST** provide confidentiality and integrity equivalent to TLS 1.2 or higher. Clients and servers **MUST** validate certificates and hostnames and **MUST NOT** send credentials over insecure or unauthenticated transports.

## Authentication and Authorisation

Only `GET /.well-known/best` is unauthenticated by design — it is the public discovery endpoint. Every other endpoint **MUST** require authentication.

Implementations **SHOULD** define distinct authorisation scopes or roles:

| Scope | Applies to |
|---|---|
| Read | `GET /events`, `GET /commands`, `GET /commands/{schema}/{version}`, `GET /queries` |
| Write | `POST /commands` |

`GET /events` **MUST** require authentication and tenant-scoped authorisation unless a specific event stream is explicitly designated public. Unauthenticated callers **MUST NOT** be able to read domain events.

## Command Authorisation

The scopes above are necessary but not sufficient. `POST /commands` is a single endpoint through which every named operation a service accepts is invoked, and those operations do not share a blast radius — submitting a timesheet and erasing a person's data arrive at the same URL under the same Write scope. A credential that may send one command **MUST NOT** thereby be able to send all of them.

### Per-command policy

- Servers **SHOULD** maintain an explicit policy of which command types each credential, service, or role may submit, and evaluate it on every submission.
- That policy **MUST** be deny-by-default: a command type with no entry is denied. Absence of a rule is not permission, and an empty policy **MUST NOT** mean "allow everything".
- Policy **MUST** be scoped to the deployment it governs. A policy shared across environments grants production access as a side effect of enabling a command in test.
- `GET /commands` **SHOULD** return the commands the authenticated caller may actually submit. A catalogue advertising commands the caller will be denied causes agents to plan operations that cannot complete, and is indistinguishable to them from a broken service.
- A denial **SHOULD** be reported distinguishably from an unknown command type, so an operator can tell a missing policy entry from a missing schema. Where catalogue membership is itself confidential, this **MAY** be collapsed into a single response.

### Actor binding

Command payloads routinely carry fields naming a person or subject — an approver, creator, sender, owner, tenant. These are caller-supplied and carry no more authority than [`source`](#cloudevent-source-field) does.

- Servers **MUST NOT** treat an actor field in `data` as authenticated identity.
- Where a field identifies the **acting** principal, the server **MUST** either reject a payload whose value differs from the authenticated principal, or overwrite it with the verified value before dispatch.
- Overwriting **SHOULD** be preferred to demanding an echo. A field whose only acceptable value is already determined by the credential is pure failure surface: a caller can only restate it correctly or receive a confusing rejection, and callers frequently do not know their own internal identifiers. Stamping cannot change the outcome for a caller that sent the right value, and converts a guaranteed rejection into success for one that did not.
- Where a field identifies a **subject other than** the caller — whose invoice, whose engagement, whose organisation — the server **MUST** authorise the caller's access to that subject. Such a field is a reference, and an unchecked reference is an insecure direct object reference.
- Authorisation **MUST NOT** be inferred from the payload validating. Schema validation establishes shape, never permission.

### High-impact commands

- Commands that are destructive, irreversible, or that bypass a compliance control **SHOULD** require a control beyond the submitting credential: human approval, a second principal, or an out-of-band confirmation.
- Such a control **MUST NOT** be self-serviceable. If the approval step can be performed by the same credential that submitted the command, it is an audit trail, not a control.
- Where a server offers an approval mode that only logs what it would otherwise reject, that mode **MUST NOT** be the default, and its active mode **MUST** be discoverable by operators.
- Servers **SHOULD** declare the [`impact` annotation](agents/commands.md#high-impact-annotations-impact) on high-impact commands, so consumers can discover which commands carry these obligations and warn the human before submitting. The annotation is descriptive: it **MUST NOT** be relied upon as the control itself — clients that ignore it must still meet the server-side requirements above.

## Credential Passthrough at Intermediaries

An intermediary that sits between end callers and a BEST endpoint (an MCP server, a gateway, a multi-user chat backend) may need to forward each caller's *own* credential upstream instead of authenticating with a single fixed identity. Per-caller credentials are preferable to a shared key — the BEST service can then apply per-user authorisation and audit — but forwarding creates a credential-leakage risk that implementations must control:

- Passthrough **MUST** be opt-in per upstream connection, disabled by default. An inbound `Authorization` header may carry a credential intended for the *intermediary itself* (e.g. OAuth between an MCP client and an MCP server); forwarding it by default would leak that credential across a trust boundary. The operator enabling passthrough is asserting that the caller's token and the upstream BEST credential belong to the same trust domain.
- A forwarded credential **MUST** be sent only to the connection's configured endpoint — never to a URL derived from request content — and only over transports satisfying the [TLS requirements](#tls).
- Where an explicit per-request credential (e.g. an `X-Api-Key` override) and an ambient `Authorization` header are both present, the explicit credential **SHOULD** take precedence. This mirrors dual-auth BEST gates, where a present API key is authoritative and never falls through to a bearer token.
- Intermediaries **MUST NOT** log or persist forwarded credentials. Diagnostics (e.g. warning that a bearer token was ignored because passthrough is disabled) **MUST** omit the credential value.
- Multi-user intermediaries **SHOULD** fail closed: configure the connection's static credential as a deliberately invalid placeholder so a request that arrives without per-caller credentials is rejected by the BEST service rather than silently executing under a shared identity.

The reference MCP server (`@behavioralstate/best-mcp`) implements this contract via its `allowBearerPassthrough` connection setting — see the [mcp-server README](https://github.com/behavioralstate/spec/tree/main/mcp-server#http--per-request-credential-overrides-multi-user-backends).

## Token Exchange and Query-String Credentials

Not every legitimate client can set HTTP headers — URL-only integrations, webhook targets, embedded widgets, legacy tooling that accepts nothing but an endpoint address. The escalation path for such clients is: prefer headers; fall back to a body-based token exchange; and only then to a query parameter carrying a **short-lived** token. The rule that keeps the weaker channels safe is that the long-lived credential is exchanged for a disposable one before it goes anywhere weaker than a header.

- When the manifest declares `authentication.type: "oauth2"`, `tokenUrl` **MUST** name an [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) token endpoint. Hosts intending to serve header-constrained clients **SHOULD** accept the `client_credentials` grant — a form-encoded POST requiring no custom request headers — and return `access_token`, `token_type`, and `expires_in` per RFC 6749 §5.1.
- Tokens issued by this exchange **SHOULD** be short-lived — minutes, not days. The exchange exists to make the credential that reaches weaker channels disposable; a long-lived exchange output defeats it.
- The exchange request carries only the credential. Tenant context **MUST** be derived from the credential itself, per [Multi-Tenant Isolation](#multi-tenant-isolation) — a tenant identifier submitted alongside it is at most a routing hint, and a server **MUST** reject an exchange whose declared tenant does not match the credential's tenant binding.
- A **long-lived** credential **SHOULD NOT** be declared or accepted as a query parameter (`apiKey` with `in: "query"`). Query strings leak through request logs, proxies, `Referer` headers, and browser history. A host that needs to serve URL-only clients **SHOULD** offer the token exchange and accept the resulting short-lived token via the `access_token` query parameter, under the constraints of [RFC 6750 §2.3](https://www.rfc-editor.org/rfc/rfc6750#section-2.3).
- Servers accepting any credential in a query parameter **MUST NOT** write the credential value to logs, **SHOULD** send `Cache-Control: no-store` on responses to such requests, and **SHOULD** issue query-eligible tokens with reduced scope — in particular, a query-borne token **SHOULD NOT** be able to submit [high-impact commands](#high-impact-commands).
- One-time login links — a single-use, short-lived code minted out of band (e.g. from an operator dashboard) and redeemed for a scoped token — are a valid implementation of this exchange for URL-only onboarding. BEST does not standardise their issuance; a host advertising one does so under a namespaced [`extensions`](discovery.md#extensions) key until a standard exists to promote.

## Command Ingestion — Schema Selection

The `dataschema` field in an inbound command is a **selector, not a location**. It names an entry the server already owns and serves at `GET /commands/{schema}/{version}`, and a conformant client takes its value verbatim from the command catalogue. The security property that matters is that the validating schema comes from the server's own catalogue — *not* which server-owned identifier keys that lookup.

A server that **fetches** the caller-supplied `dataschema` URI to perform validation is architecturally incorrect: the server owns its schema catalogue and does not need the client to point it to a schema. It is also a security risk: a caller can supply an internal URI — a cloud metadata service (`http://169.254.169.254`), an internal database, or a private host — and the server becomes an unwitting proxy. This is a Server-Side Request Forgery (SSRF) attack.

**Requirements:**
- Servers **MUST** select the schema for validation from their own catalogue. The lookup **MAY** be keyed by the command `type`, or by the schema name carried in `dataschema`, provided the entry selected is one the server owns.
- Servers **MUST NOT** fetch the caller-supplied `dataschema` URI for any purpose.
- Servers **MUST** reject a command whose schema cannot be resolved to a catalogue entry. Forwarding an unvalidated payload is not an acceptable fallback — a resolution miss must fail closed.
- Servers **MUST** document which version policy they apply. A server that honours a caller-declared version **MUST** reject a version that does not exist rather than silently substituting another; a server that always selects the latest **MUST** ignore the caller's declared version rather than partially honouring it.
- Servers **SHOULD** reject a command whose `dataschema` does not match a known entry in `GET /commands`, even when the schema was selected by `type`.
- If a server does support fetching remote schemas (for example, for cross-service federation), it **MUST** restrict URI schemes to HTTPS, apply a strict allowlist, disable redirects, and enforce fetch size, depth, and timeout limits.

### One identifier, or a total mapping

`type` (PascalCase) and the catalogue's `schema` (kebab-case) are distinct fields naming the same operation. Servers commonly derive one from the other by string transformation, and that derivation is where authorisation and validation drift apart.

**Requirements:**
- Schema selection, authorisation, and dispatch **MUST** be keyed on the same identifier. A server that authorises a command under one identifier while validating or dispatching it under another can be induced to authorise operation A and execute operation B — a confused-deputy vulnerability.
- Where a server derives one identifier from the other, that transformation **MUST** be total and unambiguous over its catalogue. If it is not — because some names do not round-trip, or two entries collapse onto one key — the server **MUST** resolve the identifier once and use the single resolved value for every subsequent decision.
- Where `type` and `dataschema` disagree about which operation is being invoked, servers **MUST NOT** satisfy one decision from each. Reject the command, or resolve consistently from one field and log the divergence.

> **Why this is worth stating.** A lossy `type`→`schema` transformation fails in two directions. If the *authorisation* key misses, a correctly permitted command is denied with a policy error naming an operation the operator never configured — expensive to diagnose, but safe. If the *validation* key misses while authorisation succeeds, the caller has selected their own contract. Deny-by-default policy (see [Command Authorisation](#command-authorisation)) keeps the second case from being reachable in most implementations, but it should not be the only thing standing in the way.

## Command Replay Protection

CloudEvent `id` is a UUID and **MUST** be treated as an idempotency key by servers.

**Requirements:**
- Servers **MUST** detect and reject or safely ignore duplicate command submissions (same `id`, same authenticated source) within a defined retention window appropriate to the domain.
- If a previously seen `id` is reused with different payload contents, the server **MUST** reject it as invalid (`409 Conflict`).
- Replay detection scope **MUST** include the authenticated tenant and sender identity, not only the `id` string, to prevent cross-tenant or cross-source collisions.

## CloudEvent `source` Field

The `source` field in a command is **caller-declared** and **MUST NOT** be treated as authenticated sender identity.

**Requirements:**
- Servers **MUST NOT** grant elevated permissions, apply authorisation policies, or make security decisions based on a caller-supplied `source` value.
- If `source` is used for audit or observability, the server **SHOULD** either overwrite it with the verified principal identity (derived from the authenticated session) or record both the declared and verified values.
- If a mismatch between `source` and the authenticated principal is a policy violation, the server **MUST** reject the command.

## Multi-Tenant Isolation

For implementations that serve multiple tenants:

- Access to tenant-scoped manifests and resources **MUST** be authorised per tenant. Knowing or guessing another tenant's identifier **MUST NOT** grant access to their resources.
- Tenant context **MUST** be derived from the authenticated identity (Bearer token, API key), not from caller-supplied path parameters, query strings, body fields, or CloudEvent attributes.
- Tenant-specific HTTP responses **MUST** be isolated in caches (`Vary` headers or non-cacheable) and **MUST NOT** be served to a different tenant.
- Command deduplication and event streams **MUST** be isolated per tenant.

## Input Limits

Servers **MUST** enforce maximum request body sizes for `POST /commands` and **SHOULD** return `413 Payload Too Large` when exceeded. Servers **MUST** bound JSON nesting depth, collection sizes, string lengths, and total attribute counts to prevent parser or validator resource exhaustion.

Servers **SHOULD** apply rate limits and quotas per authenticated client and per tenant for command submission.

## Manifest Content

The `/.well-known/best` manifest is publicly accessible by design. Its content **MUST** be limited to information intended for unauthenticated disclosure:

- Service descriptions, capability names, and transport endpoints — yes
- Internal-only endpoint addresses, tenant metadata, credential hints, or sensitive integration names — **MUST NOT** appear

The `http.endpoint` value **MUST** be a consumer-facing public URL. Internal service mesh addresses, private VPC hostnames, and backend-only paths **MUST NOT** appear in the manifest.
