# Discovery — `/.well-known/best`

Every BEST-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/best
Content-Type: application/json
```

It returns a JSON manifest describing the services, capabilities, transport bindings, and authentication requirements. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

> Normative reference: [SPEC.md — Discovery](https://github.com/behavioralstate/spec/blob/main/SPEC.md#discovery--well-knownbest) and [SPEC.md — Multi-Tenancy](https://github.com/behavioralstate/spec/blob/main/SPEC.md#multi-tenancy). Canonical schema: [discovery.json](../protocol/v1/schemas/discovery.json); complete example: [well-known-best.json](../protocol/v1/examples/well-known-best.json).

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

The manifest endpoint is **always public** — an implementation that requires auth on `/.well-known/best` is non-conformant. The response **must** use `Content-Type: application/json`; the path is canonical (`/.well-known/best.json` may be served as an alias, but consumers must not rely on it).

## Manifest Root

```json
{
  "best": {
    "version": "{{BEST_VERSION}}",
    "authentication": { ... },
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
```

| Field | Required | Description |
|---|---|---|
| `version` | yes | BEST spec version (semver) |
| `services` | yes | Service definitions with transport bindings |
| `capabilities` | yes | Supported capabilities with spec/schema URLs |
| `authentication` | no | Credential requirements — `type` (`none`/`bearer`/`apiKey`/`oauth2`) plus `scheme`, `in`, `scopes`, `tokenUrl`, `docs`. Consumers **must** read it before calling anything else. Hosts requiring credentials **should** set `docs` to an onboarding page — for multi-tenant hosts it should cover acquiring both the API key and the tenant ID, since neither is derivable from the manifest. |
| `tenants` | no | Multi-tenant discovery — see below |
| `agents` | no | Snapshot of hosted [service descriptors](#service-descriptor) |

## Capability Entries

The three standard capabilities are `io.best.agents.commands`, `io.best.agents.events`, and `io.best.agents.queries`. Each entry carries:

| Field | Description |
|---|---|
| `name` | Reverse-domain identifier; `io.best.*` is reserved for the spec, custom capabilities use an implementer-owned prefix |
| `version` | Semver |
| `spec` / `schema` | URLs to the specification page and the **JSON Schema** (not OpenAPI). Required for `io.best.*`; optional for custom capabilities |
| `service` | Key of the implementing service in `services` — required when the capability's name prefix doesn't match the service key; consumers use it to resolve which `http.endpoint` to call |
| `status` | `active` (default) · `partial` · `planned`. `active` means every required endpoint is callable — declaring it while returning `404`/`501` is a conformance violation |
| `endpoints` | Machine-readable `{ method, path }` list. Paths are appended to the service's `http.endpoint` (the leading slash is a separator, not root-relative) — this is how consumers self-bootstrap without reading spec pages |
| `push` | Events capability only — declared push channels |

```json
"push": { "sse": true, "mcp": true }
```

| Field | Description |
|---|---|
| `push.sse` | SSE stream supported at `GET /events/stream` |
| `push.mcp` | Server-to-client MCP notifications supported — see [MCP transport](transports/mcp.md) |

**Command types are domain data, not capabilities** — individual types (`ProposeCounter`) never appear as capability entries; they are discovered at runtime via `GET /commands`.

## Service Descriptor

A service descriptor is the identity card of a hosted service: `id`, `name`, `accepts`/`produces` (PascalCase CloudEvent `type` strings), `status` (`running`/`paused`/`stopped`/`error`), and optional `metadata` (opaque operational configuration — model name, system prompt — never interpreted by the protocol). Descriptors appear in the manifest's `agents` array as a discovery hint, not a live directory: BEST defines **no registry endpoint** — implementations that manage services dynamically expose that as a domain (see the [registry worked example](composing-processes.md#worked-example-a-service-registry-with-heartbeat)). Complete example: [service-descriptor.json](../protocol/v1/examples/service-descriptor.json).

## Transport Bindings

```json
"http": { "endpoint": "https://api.example.com/" },
"mcp":  { "transport": "stdio", "server": "best-mcp" }
```

| Transport | Primary consumer | Protocol |
|---|---|---|
| **HTTP** | Web UIs, traditional services, monitoring tools | HTTP/JSON |
| **MCP** | LLM clients (ChatGPT, Copilot, Gemini, Claude) | JSON-RPC over stdio/SSE |

`http.endpoint` is the **consumer-facing base URL** — the outermost address consumers hit, never an internal backend or service-mesh URL. All capability paths are appended to it. Multiple transports expose the **same capability surface** — alternative access methods, never separate operation sets.

## Multi-Tenancy

A tenant ID is an opaque string scoping a manifest to a context — a customer account, a user, a workspace, or the platform's own administrative context (a reserved, privileged tenant ID keeps the model uniform: no separate "untenanted" surface). Use `tenants.manifest` when callers operate in isolated data scopes — even with identical capabilities per tenant — and skip it for single-tenant deployments.

The root manifest declares an RFC 6570 URI template; `{tenantId}` is the only permitted variable:

```json
"tenants": {
  "manifest": "https://api.example.com/.well-known/best/{tenantId}"
}
```

Rules:

- Expanding the template yields a **fully self-contained tenant manifest**: no placeholders anywhere, every `dataschema` URI fully resolved, no `tenants` block of its own. Treat it exactly like a direct service manifest.
- The root manifest's `capabilities` array contains **only what the root can fulfil directly** — tenant-scoped capabilities appear only in tenant manifests.
- Fetching a tenant manifest requires only the declared credential — the tenant ID is already in the URL; implementations must not additionally demand a tenant header.
- Tenant context is established at the manifest level, never inside nested URI values — BEST defines no URI templating outside `tenants.manifest`.

Per-tenant manifests pay off even when all tenants share one capability surface: the tenant's `http.endpoint` structurally encodes the scope into every path (auditable at the infrastructure layer), `dataschema` URIs need no caller-side substitution, and an organisation's members share one manifest and key.

For the first-contact algorithm — what to read, what to collect from the user, and when to fetch the tenant manifest — see [SPEC.md — Agent Navigation Guide](https://github.com/behavioralstate/spec/blob/main/SPEC.md#agent-navigation-guide). One rule worth repeating: **do not fall back to external OpenAPI/Swagger documents** — the BEST manifest is the canonical discovery surface, and `GET /commands` is the definitive answer to "what can I do here."
