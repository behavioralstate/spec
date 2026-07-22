# Discovery — `/.well-known/best`

Every BEST-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/best
Content-Type: application/json
```

This returns a JSON manifest describing the available agents, services, capabilities, and transport bindings. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

> **Content-Type:** The response **must** use `Content-Type: application/json`. Consumers must not assume a `.json` file extension on the URL. The path `/.well-known/best` is canonical. Implementations **may** also serve `/.well-known/best.json` as an alias (for compatibility with static file hosts), but this is not required and consumers must not rely on it.

## Discovery Flow

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Consumer</div>
    <div class="BEST-node-box">Any Client</div>
    <div class="BEST-node-sub">LLM · agent · app</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">GET /.well-known/best</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Manifest</div>
    <div class="BEST-node-box accent">BEST Endpoint</div>
    <div class="BEST-node-sub">capabilities · auth · schemas</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">Start interacting</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">APIs</div>
    <div class="BEST-node-box">Commands &amp; Queries</div>
    <div class="BEST-node-sub">no config required</div>
  </div>
</div>

1. Consumer hits `/.well-known/best`
2. Reads the structured manifest
3. Discovers available services, capabilities, transport bindings, and authentication requirements
4. If `authentication.type` is not `none`, obtains credentials before calling API endpoints
5. Starts interacting without any hard-coded integration

## Manifest Structure

```
/.well-known/best                   → what can I do? (discovery)
/schemas/event.json                → what does an event look like? (contract)
/specs/agents/event-delivery       → how does event delivery work? (documentation)
```

## Manifest Root

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "authentication": { ... },
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | BEST spec version (semver: `"MAJOR.MINOR.PATCH"`) |
| `authentication` | object | no | Authentication requirements for this endpoint (omit for public endpoints) |
| `tenants` | object | no | Multi-tenant manifest discovery. When present, signals that this is a multi-tenant host and provides a URI template for consumers to obtain a tenant-scoped manifest. See [Multi-Tenant Routing](#multi-tenant-routing). |
| `services` | object | yes | Service definitions with transport bindings. Each service entry may include a `version` field (see [Versioning](../versioning.md)). |
| `capabilities` | array | yes | Supported capabilities with schema URLs |

## Authentication

If an endpoint requires authentication, it declares this in the `authentication` block. Consumers **must** read this block before making any API calls.

```json
"authentication": {
  "type": "apiKey",
  "scheme": "X-Api-Key",
  "in": "header",
  "docs": "https://docs.example.com/authentication"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | One of: `"none"`, `"bearer"`, `"apiKey"`, `"oauth2"` |
| `scheme` | string | no | Authorization header value prefix (e.g. `"Bearer"`) |
| `in` | string | no | Where the API key is passed: `"header"` or `"query"` (for `apiKey` type) |
| `scopes` | string[] | no | Required OAuth2 / token scopes |
| `tokenUrl` | string | no | Token endpoint URL for OAuth2 or token-based flows |
| `docs` | string | no | URL to human-readable authentication documentation |

The `/.well-known/best` endpoint itself is always publicly accessible without credentials so consumers can read the manifest. All other endpoints may require authentication as declared.

> **Recommended — point callers at onboarding, especially for multi-tenant hosts.** Because the manifest is the only thing an un-onboarded caller can read, a host that requires credentials **should** set `authentication.docs` to a page explaining how to obtain them. For multi-tenant hosts (those exposing `tenants.manifest`), a caller needs **both** an API key **and** their tenant id before any capability is reachable, and neither is derivable from the manifest alone — so the linked page should cover acquiring both. Without it, a conformant client can discover the auth *scheme* from the manifest but has no path to actually acquiring credentials, and must fall back to out-of-band documentation.

## Services

Services are top-level domains. Each service has its own version, spec URL, and transport bindings.

| Service | Namespace | Description |
|---|---|---|
| Agents | `io.best.agents` | Command ingestion, queries, published events |

## Capabilities

Capabilities are composable building blocks within a service.

| Capability | Description | Extends |
|---|---|---|
| `io.best.agents.commands` | Discover available commands (catalogue), send commands (ingestion) | — |
| `io.best.agents.events` | List and query domain events, event catalogue, event schema discovery | — |
| `io.best.agents.queries` | Discover and execute synchronous reads of current state | — |

Each capability object has these fields:

| Field | Description |
|---|---|
| `name` | Fully qualified capability identifier (e.g. `io.best.agents.commands`) |
| `version` | Semver version string |
| `description` | Human-readable summary |
| `spec` | URL to the capability specification page |
| `schema` | URL to the **JSON Schema** for this capability's data structures — e.g. `commands.json`, `events.json`. This is a JSON Schema file, not an OpenAPI spec. |
| `service` | Key of the implementing service in the manifest's `services` object (e.g. `"io.best.agents"`, `"io.dotquant.trading"`). Required when the capability's name prefix does not match the service key — for example, a custom service implementing a standard BEST capability. Consumers use this to resolve which `http.endpoint` to call for the capability's endpoints. |
| `status` | `active`, `partial`, or `planned` (omitted means active) |
| `extends` | Parent capability name, if this extends another |
| `endpoints` | Machine-readable list of HTTP endpoints exposed by this capability. Each entry has a `method` (GET/POST/DELETE/etc.) and a `path`. Paths are appended to `http.endpoint` to form the full URL — the leading slash is a separator, not a root-relative indicator. For example, if `http.endpoint` is `https://api.example.com/tenants/acme`, then `{ "path": "/commands" }` resolves to `https://api.example.com/tenants/acme/commands`. The HTTP method signals whether the operation is a read (GET) or a write (POST/DELETE/etc.). Consumers use this to discover catalogue URLs and determine mutability without reading the spec page. |
| `push` | Optional object declaring which push channels this capability supports (see [Push Channel Declaration](#push-channel-declaration)). |

### Push Channel Declaration

The `io.best.agents.events` capability **may** include a `push` object declaring which push channels are supported for delivering events to callers. All fields are optional — absence means the channel is not supported.

```json
{
  "name": "io.best.agents.events",
  "version": "{{BEST_VERSION}}",
  "endpoints": [
    { "method": "GET",    "path": "/events" },
    { "method": "GET",    "path": "/events/stream" },
    { "method": "GET",    "path": "/events/{schema}/{version}" },
    { "method": "POST",   "path": "/subscriptions" },
    { "method": "DELETE", "path": "/subscriptions/{id}" }
  ],
  "push": {
    "sse": true,
    "mcp": true,
    "webhook": true
  }
}
```

| Field | Type | Description |
|---|---|---|
| `push.sse` | boolean | Server-Sent Events stream supported at `GET /events/stream` — recommended for browser apps, CLI tools, and locally-running agents that cannot expose a public webhook endpoint |
| `push.mcp` | boolean | Server-to-client MCP notifications are supported — see [MCP transport](../transports/mcp.md) |
| `push.webhook` | boolean | Webhook callback delivery is supported — callers may register via `POST /subscriptions` |

### Capability Status

Each capability in the manifest may declare a `status` field:

| `status` | Meaning | Consumer behaviour |
|---|---|---|
| `"active"` (or omitted) | Fully implemented | All required endpoints exist and are callable |
| `"partial"` | Subset implemented | Some required endpoints may be missing or stubbed — consumers must not assume full coverage |
| `"planned"` | Not yet implemented | No endpoints exist; declared for discovery purposes only |

Implementers should use `"partial"` when a backing service exists but does not yet cover all required endpoints for a capability, rather than declaring a capability `active` and returning `404` or `501` on some routes.

A BEST endpoint **selectively exposes** only the capabilities it supports. Consumers discover what's available by reading the manifest.

### Custom and Domain-Specific Capabilities

Implementers can expose capabilities beyond the `io.best.*` set. Custom capabilities **must** use a reverse-domain prefix that the implementer controls — following the same convention as Java package names and Android intents:

| Convention | Example |
|---|---|
| BEST built-in | `io.best.agents.commands` |
| Organisation-scoped | `io.dotquant.trading`, `com.acme.inventory` |
| Team-scoped | `com.acme.payments.refunds` |

The capability name must be unique. Implementers are responsible for ensuring their prefix does not conflict with others. The `io.best.*` namespace is reserved for the BEST specification.

For `io.best.*` capabilities, `spec` and `schema` are **required** — they point at the published BEST specification and schema pages. For custom capabilities they are **optional**: the BEST project does not host documentation for implementer-owned namespaces. Implementers **should** host their own specification page and JSON Schema for each custom capability and link them via `spec` and `schema` so consumers can self-serve, but a custom capability without them is still conformant.

## Agents Array — Declared Service Descriptors

The `services` object in the manifest holds transport binding definitions. Separately, the manifest **may** include an `agents` array — a snapshot of the [service descriptors](#service-descriptor) (id, accepts, produces, status, metadata) the endpoint hosts. This is a discovery hint, not a live directory: BEST defines no registry endpoint. Implementations that manage services dynamically can expose that as a domain — a `list-services` query and `RegisterService` command — under their own namespace (see [Registry](agents/registry.md) for the recommended vocabulary).

### Service Descriptor

A service descriptor is the identity card for a BEST-compliant service: what it does, the commands it accepts, the events it produces, and optional operational `metadata` (model name, system prompt, provider settings — opaque to the protocol). Descriptors appear as entries in the manifest's `agents` array. See [service-descriptor.json](../protocol/v1/examples/service-descriptor.json) for a complete example and [discovery.json](../protocol/v1/schemas/discovery.json) for the schema.

## Transport Bindings

Each service declares how it can be reached:

```json
"http": {
  "endpoint": "https://your.compliant.BEST.endpoint/"
},
"mcp": {
  "transport": "stdio",
  "server": "best-mcp"
}
```

| Transport | Primary consumer | Protocol |
|---|---|---|
| **HTTP** | Web UIs, traditional services, monitoring tools | HTTP/JSON |
| **MCP** | LLM clients (ChatGPT, Copilot, Gemini, Claude) | JSON-RPC over stdio/SSE |
| **gRPC** | Internal native runtime (optional) | Protocol Buffers |

### Multi-Tenant Routing

For multi-tenant SaaS implementations that serve multiple tenants under one host, the standard pattern is to include a `{tenantId}` segment in every tenant-scoped path:

```
GET  https://api.example.com/{tenantId}/agents
POST https://api.example.com/{tenantId}/events
```

`http.endpoint` remains the root consumer-facing URL (e.g. `https://api.example.com/`). The `{tenantId}` segment is declared as a path parameter on every tenant-scoped route. Authentication (typically a Bearer API key) identifies the caller; `{tenantId}` identifies which tenant's surface to target. Both are required on every request.

### `tenants.manifest` — URI Template for Tenant Discovery

#### What is a tenant?

BEST does not define what a tenant *is* — that is the implementer's domain model. A tenant ID in BEST is simply an opaque string that scopes a manifest to a particular context. What that context represents depends entirely on the platform:

| Platform model | Tenant maps to |
|---|---|
| B2B SaaS serving multiple companies | The company / customer account |
| Developer platform with per-user isolation | The individual user account |
| Enterprise platform with sub-organisations | The organisation or workspace |
| API gateway serving multiple products | The product or project |
| Platform with a central/administrative context | The platform itself — a reserved tenant exposing cross-cutting capabilities |

> **The platform itself can be a tenant.** A reserved tenant ID (e.g. `platform`) may represent the operator's own administrative context, exposing cross-cutting capabilities — platform-owned data, cross-tenant aggregations — that ordinary tenants do not have. This keeps the model uniform: there is **no separate "untenanted" surface**, just one more tenant with its own manifest at `/.well-known/best/{tenantId}`. Whether that reserved tenant's handlers may read across *other* tenants is an authorization concern BEST does not define — the protocol only sees a tenant whose capability surface happens to differ (the *"Different capability surfaces"* reason below). Implementers should treat such a tenant ID as reserved and privileged, so an ordinary tenant can never assume its capabilities.

#### Why use multi-tenancy?

There are two distinct reasons to use `tenants.manifest`, and they are independent of each other:

| Reason | Description | Example |
|---|---|---|
| **Different capability surfaces** | Different tenants accept different commands or expose different schemas | Free tier vs. enterprise tier |
| **Data scope isolation** | All tenants share the same capabilities, but each tenant's data is separate | B2B SaaS where every org has the same commands but their own records |

The second reason is just as valid as the first — and more common in practice. **You do not need different capabilities per tenant to benefit from `tenants.manifest`.**

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Shared capabilities</div>
    <div class="BEST-node-box">Same commands<br/>Same schemas</div>
    <div class="BEST-node-sub">all tenants</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">but</div>
    <div class="BEST-arrow-track">≠</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Isolated data</div>
    <div class="BEST-node-box accent">Separate data<br/>Separate endpoints</div>
    <div class="BEST-node-sub">per-tenant manifest</div>
  </div>
</div>

**Benefits of per-tenant manifests even when capabilities are identical:**

1. **Pre-scoped base URL** — the tenant manifest's `http.endpoint` already contains the tenant context (e.g. `https://api.example.com/api/BEST/tenants/acme`). A consumer configured with this manifest never needs to inject a tenant ID into requests — it is structurally encoded into every path.

2. **Self-contained `dataschema` URIs** — every command catalogue entry's `dataschema` URI is fully resolved against the tenant endpoint. No placeholders, no caller-side substitution required.

3. **Data isolation is explicit and auditable** — tenant scope is visible in the URL on every request, not hidden inside an API key or a request header. This makes it easy to audit, log, and enforce at the infrastructure layer.

4. **Shared team access** — when a tenant represents an organisation, all members of that org share one manifest and one API key. No per-user configuration is needed for consumers (agents, MCP clients, bots).

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Consumer</div>
    <div class="BEST-node-box">Agent / MCP client</div>
    <div class="BEST-node-sub">configured with tenant endpoint</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">POST /commands<br/>(no tenantId needed)</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Tenant endpoint</div>
    <div class="BEST-node-box accent">api.example.com/<br/>tenants/acme/commands</div>
    <div class="BEST-node-sub">scope already encoded</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">routes to</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Tenant data</div>
    <div class="BEST-node-box">acme's records only</div>
    <div class="BEST-node-sub">isolated</div>
  </div>
</div>

**When to use multi-tenancy:** Use `tenants.manifest` when different callers operate in isolated data scopes, even if all tenants share the same capability surface. Also use it when different tenants genuinely have different capabilities or schemas.

**When to skip it:** A single-tenant deployment, a self-hosted service with one user, or any implementation where a single manifest describes the full capability surface *and* all callers share the same data scope. The `tenants.manifest` pattern adds a required onboarding step — only use it when per-caller scoping genuinely applies.

To make tenant manifest discovery machine-actionable, the root manifest may declare a `tenants` block with a `manifest` URI template (RFC 6570):

```json
"tenants": {
  "manifest": "https://api.example.com/.well-known/best/{tenantId}"
}
```

The `{tenantId}` segment trails the canonical `/.well-known/best` path. This keeps the well-known URL in its standard position and makes the tenant qualifier obvious to any consumer already familiar with the discovery convention.

| Field | Type | Required | Description |
|---|---|---|---|
| `tenants.manifest` | string (URI template) | yes (if `tenants` present) | RFC 6570 URI template. `{tenantId}` is the only defined variable. Consumers expand this template with a known tenant ID to obtain a fully-resolved, self-contained manifest. |

Rules:
- `{tenantId}` is the only permitted variable in the template. No other template variables are defined by BEST.
- A consumer expands the template and fetches the resulting URL. That URL returns a fully self-contained manifest with no placeholders.
- The root manifest's `capabilities` array must contain **only capabilities the root can fulfill directly**. Tenant-scoped capabilities (e.g. `io.best.agents.commands`, `io.best.agents.events`) must be **omitted from the root manifest** — they appear only in the tenant manifest.
- The tenant manifest does not include a `tenants` block itself — it is already fully scoped.
- The `tenants.manifest` template is distinct from `dataschema`. URI templates are only valid in `tenants.manifest`; everywhere else in the manifest URIs must be fully resolved.

For how `{tenantId}` maps to path parameters in the HTTP transport, see [Multi-Tenant Routing in the HTTP transport spec](transports/http.md#multi-tenant-routing).

**Root manifest (multi-tenant host):**

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "tenants": {
      "manifest": "https://api.example.com/.well-known/best/{tenantId}"
    },
    "services": {
      "io.best.agents": {
        "version": "{{BEST_VERSION}}",
        "http": { "endpoint": "https://api.example.com/" }
      }
    },
    "capabilities": []
  }
}
```

> The root manifest of a multi-tenant host typically declares **no** capabilities of its own — it only routes consumers to a tenant manifest via `tenants.manifest`. Any capability the root can fulfil directly without a tenant context may be listed here.

**Tenant manifest (returned at the expanded URI):**

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "services": {
      "io.dotquant.trading": {
        "version": "{{BEST_VERSION}}",
        "http": {
          "endpoint": "https://api.example.com/api/best/tenants/be9e0176"
        }
      }
    },
    "capabilities": [
      {
        "name": "io.best.agents.commands",
        "service": "io.dotquant.trading",
        "endpoints": [
          { "method": "GET",  "path": "/commands" },
          { "method": "POST", "path": "/commands" },
          { "method": "GET",  "path": "/commands/{schema}/{version}" }
        ]
      }
    ]
  }
}
```

> **`dataschema` URIs must be fully resolvable.** The `dataschema` field in a command catalogue entry is a URI that a consumer dereferences directly. It must not contain placeholder segments (e.g. `{tenantId}`) that require caller-side substitution — BEST defines no URI templating convention. For multi-tenant implementations where command schemas are tenant-scoped, serve a distinct `/.well-known/best` manifest per tenant — via subdomain (`https://{tenantId}.api.example.com/.well-known/best`) or the canonical trailing-segment pattern (`https://api.example.com/.well-known/best/{tenantId}`) — so that every manifest contains fully-resolved `dataschema` URIs. Tenant context is established at the manifest level, not inside nested URI values.

See [HTTP transport](./transports/http.md) for the full multi-tenant routing reference.

## Agent Navigation Guide

This section describes the algorithm an AI agent or automated client should follow when interacting with a BEST endpoint for the first time. This is the canonical discovery flow — not just for web UIs.

### Step 1 — Fetch the root manifest

```
GET /.well-known/best
```

This endpoint is **always public** — no credentials required. It returns the manifest JSON. An implementation that requires auth on `/.well-known/best` is non-conformant.

From the root manifest, extract two things before doing anything else:
- `best.authentication` — what credentials are required for all other calls
- `best.tenants.manifest` — whether this is a multi-tenant host

### Step 2 — Identify the manifest type and collect prerequisites

| What the root manifest shows | What it means | What to collect from the user |
|---|---|---|
| `capabilities` contains `io.best.agents.commands` | Direct service — commands discoverable here | Credentials only (if `authentication` is declared) |
| `tenants.manifest` present, no `io.best.agents.commands` | Multi-tenant router — must fetch tenant manifest first | **Both credentials and tenant ID** |
| Neither | Service has no command surface | Nothing — report to user |

> **Collect everything before making any authenticated request.** When the root manifest declares authentication AND requires a tenant ID, ask the user for both in a single prompt. Do not make a round-trip to the tenant manifest endpoint without credentials — you already know from the root manifest that auth is required.

### Step 3 — Resolve the tenant manifest (multi-tenant only)

Once you have both credentials and the tenant ID:

1. Expand the URI template: replace `{tenantId}` in `tenants.manifest` with the tenant ID the user provided.
2. Fetch the expanded URL, including any required credentials declared in `best.authentication`.
3. The tenant manifest is a self-contained, fully-resolved manifest. Treat it exactly as you would a direct service manifest from this point on.

```
Template:  https://api.example.com/.well-known/best/{tenantId}
Tenant ID: acme
Resolved:  GET https://api.example.com/.well-known/best/acme
           X-Api-Key: <user's key>
```

> **Tenant manifest auth:** Only the API key credential is required to fetch a tenant manifest — the tenant ID is already in the URL. Implementations MUST NOT require a tenant ID header to access `/.well-known/best/{tenantId}`; the path parameter already carries it.

### Step 4 — Read the capability endpoints

Find the `io.best.agents.commands` capability in `best.capabilities`. Its `endpoints` array lists the available HTTP operations:

```json
{
  "name": "io.best.agents.commands",
  "service": "io.example.myservice",
  "endpoints": [
    { "method": "GET",  "path": "/commands" },
    { "method": "POST", "path": "/commands" }
  ]
}
```

Resolve each path against the `http.endpoint` of the service named in `service` (or the default `io.best.agents` service if `service` is absent).

### Step 5 — Fetch the command catalogue

```
GET {http.endpoint}/commands
X-Api-Key: <credentials>
```

This returns the list of command types the service accepts, each with a `schema`, `version`, `dataschema` URI, and optional `description`. This is the definitive answer to "what commands are available."

### Quick reference: signals and actions

| What you see in the manifest | What to collect | What to do |
|---|---|---|
| `capabilities` has `io.best.agents.commands` | Credentials only | Fetch `GET /commands` |
| `tenants.manifest` present, no commands capability | Credentials + tenant ID together | Expand template, fetch tenant manifest, then proceed |
| `capabilities` has `io.best.agents.commands` with `status: "planned"` | — | Commands not yet implemented — report to user |
| `capabilities` is empty and no `tenants.manifest` | — | No discoverable capabilities — report to user |

> **Do not fall back to external OpenAPI/Swagger documents.** The BEST manifest is the canonical discovery surface. Any Swagger or OpenAPI URL in an implementer's response describes their application API — it is not the BEST command catalogue and may expose internal, non-BEST endpoints.

### `http` Transport Fields

| Field | Description |
|---|---|
| `http.endpoint` | **Consumer-facing base URL.** Must be publicly reachable by the consumer — never an internal backend address or private service-mesh URL. All HTTP API paths are appended to this value. |

The `http.endpoint` value is the **consumer-facing base URL**. All HTTP API paths are appended to it. For example, if `http.endpoint` is `https://app.agenthost.example/`, then the command catalogue is at `https://app.agenthost.example/commands`.

> **`http.endpoint` must be a publicly reachable consumer address** — never an internal backend or private service URL. If the implementation sits behind a proxy or API gateway, `http.endpoint` is the outermost address consumers hit.

> **Multiple transports describe the same capability surface.** When both `http` and `mcp` are declared, they each provide access to the same logical capabilities — they are alternative access methods, not separate operation sets. Consumers choose one transport; they do not infer separate capabilities from the presence of multiple transports.

## Schema

See [discovery.json](../protocol/v1/schemas/discovery.json) for the full JSON Schema.

## Full Example

See [well-known-best.json](../protocol/v1/examples/well-known-best.json) for a complete manifest example.
