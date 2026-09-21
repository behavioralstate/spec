# best-validate

Conformance validator for **BEST** (Behavioral State Protocol) endpoints. Points at a live endpoint and runs the spec's [conformance checklist](../SPEC.md#conformance) as executable checks: discovery manifest (fetched and validated against the published JSON Schemas), capability declaration rules, per-capability endpoint probes, multi-tenant root-manifest rules, error format, and auth enforcement — and, from spec 0.9.11, Manifest Discipline, access declared versus access served, agent registration (RFC 8628) and the single entry.

**A plain run never writes anything.** The only POSTs issued are a command with an intentionally unknown `type`, which a conformant endpoint rejects during validation before anything is queued, and a token request with an intentionally unknown `device_code`. The one probe that creates something — a real, inert registration that expires by itself — runs only with `--probe-registration`.

**Staging.** Rules that spec 0.9.11 states and 0.10.0 requires are reported as **warnings** until then (each says "required from 0.10.0"). Misuse of a 0.9.11 field — a service declared public that answers `401`, a `deviceAuthorizationUrl` whose `tokenUrl` does not serve the device-code grant — is a failure now, because those fields are opt-in.

```bash
npx @behavioralstate/best-validate https://api.example.com
```

Exit code `0` = conformant (warnings allowed), `1` = one or more failures, `2` = internal error.

## Options

| Flag | Description |
|---|---|
| `--api-key <key>` | Credential for authenticated endpoints. Without it, protected routes are only checked for existence (a `401` counts as "route exists, auth enforced"). |
| `--auth-type <t>` | `bearer` \| `apikey` \| `none` — overrides what the manifest declares. |
| `--auth-header <name>` | Header name for `apikey` auth (default `X-Api-Key`, or the manifest's `scheme`). |
| `--auth-in <where>` / `--auth-param <name>` | Query-parameter auth. |
| `--tenant <id>` | For multi-tenant hosts: expands `tenants.manifest`, validates the tenant manifest, and probes its capabilities. |
| `--probe-registration` | Also `POST` to `authentication.deviceAuthorizationUrl` and check the RFC 8628 answer (service-generated `device_code`, distinct from the `user_code`, absent from the person's link). Off by default — it is the validator's only write. |
| `--json` | Machine-readable report (for CI). |
| `--timeout <ms>` | Per-request timeout (default 10000). |

## Examples

```bash
# Public endpoint
best-validate https://api.example.com

# Authenticated multi-tenant host
best-validate https://api.example.com --api-key $KEY --tenant acme

# CI mode
best-validate https://api.example.com --api-key $KEY --json
```

## What is checked

- **Discovery** — `GET /.well-known/best` returns `200` without credentials, `application/json`, root key present, full JSON-Schema validation against [`discovery.json`](../protocol/v1/schemas/discovery.json), semver version, `io.best.*` capabilities carry `spec`+`schema` URLs, valid `status` values.
- **Multi-tenancy** (when `tenants.manifest` is declared) — template has `{tenantId}`, root capabilities sit on services that declare their own `authentication`, tenant manifest is fully resolved, self-contained, and schema-valid. The root's own capabilities are probed whether or not `--tenant` is given.
- **Manifest Discipline** — every service is the implementing service of a capability (a multi-tenant root may announce a service its tenant manifest declares — confirmed with `--tenant`); no URI template outside `tenants.manifest`; no surface under a pseudo-tenant (`public`, `default`, `anonymous`); manifest descriptions within 500 characters and free of URLs, templates, header names, credential formats and catalogue operation names.
- **Access** — a service that declares `"type": "none"` answers without credentials; a surface that answers without credentials says so in its manifest.
- **Registration** — `deviceAuthorizationUrl` comes with `tokenUrl`; `tokenUrl` refuses an unknown `device_code` as a bad grant; with `--probe-registration`, the device authorization answer itself. A service that needs a credential and declares no `deviceAuthorizationUrl` gets a warning: an agent cannot obtain one by itself.
- **Commands** (`active`) — catalogue shape, absolute `dataschema` URIs, `commandType` stated, schema-document retrieval, no internal routing members in served schema documents, no public command that asks its caller to mint a secret, unknown-type rejection with the BEST error format, `application/cloudevents+json` accepted, unknown-schema `404`.
- **Events** (`active`) — event list shape, first-event envelope validation, auth enforcement on `GET /events`.
- **Workflows** (declared `active`) — index shape; every step of the first recipes resolves through its `dataschema` alone (the blind pass); no recipe instructs the consumer about its own client or configuration.
- **Vocabulary** — no command, query or workflow is named after the person's acts (sign-in, sign-up, sign-out, login, logout).
- **Single entry** — no `/llms.txt` on the origin that restates the BEST surface.
- **Queries** (declared `active`) — catalogue shape, schema document with `response` section, execution, and result-vs-declared-schema validation.

Capabilities with `status: "partial"` or `"planned"` are skipped per the conformance rules; custom (non-`io.best.*`) capabilities are out of checklist scope.

## Development

```bash
npm install
npm run build     # syncs schemas from ../protocol/v1/schemas and compiles
node dist/index.js http://localhost:4810
npm test          # builds, then runs the CLI against an in-process mock service: a clean one and a divergent one
```

The published package embeds the protocol schemas at build time (`scripts/sync-schemas.mjs`), so the CLI validates against exactly the schemas of the spec version it shipped with.
