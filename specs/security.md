# Security Considerations

OAP is an open protocol with a broad attack surface. This page catalogues the security requirements that every conformant implementation must observe.

## TLS

All OAP HTTP endpoints **MUST** be served over HTTPS. Cleartext HTTP **MUST NOT** be used in production. Any MCP transport carrying OAP traffic or credentials **MUST** provide confidentiality and integrity equivalent to TLS 1.2 or higher. Clients and servers **MUST** validate certificates and hostnames and **MUST NOT** send credentials over insecure or unauthenticated transports.

## Authentication and Authorisation

Only `GET /.well-known/oap` is unauthenticated by design — it is the public discovery endpoint. Every other endpoint **MUST** require authentication.

Implementations **SHOULD** define distinct authorisation scopes or roles:

| Scope | Applies to |
|---|---|
| Read | `GET /services`, `GET /events`, `GET /commands`, `GET /commands/{schema}/{version}` |
| Write | `POST /commands`, `POST /services`, `DELETE /services/{id}` |
| Admin | `POST /services/{id}/pause`, `POST /services/{id}/resume` |

`GET /events` **MUST** require authentication and tenant-scoped authorisation unless a specific event stream is explicitly designated public. Unauthenticated callers **MUST NOT** be able to read domain events.

## Command Ingestion — `dataschema` Validation

The `dataschema` field in an inbound command is informational metadata — it documents which schema the client used when constructing the payload. It is not an instruction to the server. Servers select the validation schema using the `type` field, by looking up the command type in their own catalogue.

A server that fetches the caller-supplied `dataschema` URI to perform validation is architecturally incorrect: the server owns its schema catalogue and does not need the client to point it to a schema. It is also a security risk: a caller can supply an internal URI — a cloud metadata service (`http://169.254.169.254`), an internal database, or a private host — and the server becomes an unwitting proxy. This is a Server-Side Request Forgery (SSRF) attack.

**Requirements:**
- Servers **MUST** select the schema for validation from their own catalogue, keyed by the command `type` field.
- Servers **MUST NOT** fetch the caller-supplied `dataschema` URI for any purpose.
- Servers **SHOULD** verify that `dataschema` matches a known entry in `GET /commands` and reject commands whose `dataschema` does not match a server-owned catalogue URI.
- If a server does support fetching remote schemas (for example, for cross-service federation), it **MUST** restrict URI schemes to HTTPS, apply a strict allowlist, disable redirects, and enforce fetch size, depth, and timeout limits.

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

## Webhook SSRF Protection

When a service is registered with a `webhook.url`, the server will subsequently POST CloudEvents to that URL. A caller can exploit this to make the server issue requests to internal services.

**Requirements:**
- Servers **MUST** validate `webhook.url` before storing or using it.
- Servers **MUST** reject URLs that resolve to loopback addresses, link-local addresses (`169.254.0.0/16`), RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), multicast addresses, or internal DNS names.
- `webhook.url` **MUST** be an absolute HTTPS URL and **MUST NOT** contain userinfo credentials in the URL.
- Webhook delivery **MUST NOT** follow HTTP redirects, or **MUST** re-apply the same validation rules to any redirect target before following.
- Servers **MUST** re-validate the resolved IP address at delivery time, not only at registration time, to prevent DNS rebinding attacks.
- Servers **SHOULD** require proof of webhook endpoint ownership before activating delivery (for example, a challenge-response handshake or an out-of-band confirmation).

## Multi-Tenant Isolation

For implementations that serve multiple tenants:

- Access to tenant-scoped manifests and resources **MUST** be authorised per tenant. Knowing or guessing another tenant's identifier **MUST NOT** grant access to their resources.
- Tenant context **MUST** be derived from the authenticated identity (Bearer token, API key), not from caller-supplied path parameters, query strings, body fields, or CloudEvent attributes.
- Tenant-specific HTTP responses **MUST** be isolated in caches (`Vary` headers or non-cacheable) and **MUST NOT** be served to a different tenant.
- Command deduplication, service registrations, event streams, and webhook configurations **MUST** be isolated per tenant.

## Input Limits

Servers **MUST** enforce maximum request body sizes for `POST /commands` and `POST /services` and **SHOULD** return `413 Payload Too Large` when exceeded. Servers **MUST** bound JSON nesting depth, collection sizes, string lengths, and total attribute counts to prevent parser or validator resource exhaustion.

Servers **SHOULD** apply rate limits and quotas per authenticated client and per tenant for command submission and service registration.

## Manifest Content

The `/.well-known/oap` manifest is publicly accessible by design. Its content **MUST** be limited to information intended for unauthenticated disclosure:

- Service descriptions, capability names, and transport endpoints — yes
- Internal-only endpoint addresses, tenant metadata, credential hints, or sensitive integration names — **MUST NOT** appear

The `http.endpoint` value **MUST** be a consumer-facing public URL. Internal service mesh addresses, private VPC hostnames, and backend-only paths **MUST NOT** appear in the manifest.
