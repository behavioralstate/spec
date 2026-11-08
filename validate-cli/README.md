# best-validate

Conformance validator for **BEST** (Behavioral State Protocol) endpoints. Points at a live endpoint and runs the spec's [conformance checklist](../SPEC.md#conformance) as executable checks: discovery manifest (fetched and validated against the published JSON Schemas), capability declaration rules, per-capability endpoint probes, multi-tenant root-manifest rules, error format, and auth enforcement — and, from spec 0.9.11, Manifest Discipline, access declared versus access served, agent registration (RFC 8628) and the single entry — and, from 0.9.14, the sign-in guidance.

**A plain run never writes anything.** The only POSTs issued are commands with an intentionally unknown `type` (one of them over 1 MiB, to see the `413` answer), which a conformant endpoint rejects during validation before anything is queued, and a token request with an intentionally unknown `device_code`. The one probe that creates something — a real, inert registration that expires by itself — runs only with `--probe-registration`.

**Warnings.** Manifest Discipline, the single entry, the pseudo-tenant rule, a surface whose access the manifest does not declare (a root surface with no `authentication` of its own, a service answering `200` without the credential its block requires), accepting `application/cloudevents+json`, the JSON errors of the registration endpoints, the tenants root, an `/events` range in RFC 3339, a query's `parameters` schema enforced, a workflows capability `active` with no recipe, and the `413` and `429` answers are reported as **warnings**. Misuse of a 0.9.11 field — a service declared public that answers `401`, a `deviceAuthorizationUrl` whose `tokenUrl` does not serve the device-code grant — is a failure now, because those fields are opt-in.

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
| `--probe-registration` | Also `POST` to `authentication.deviceAuthorizationUrl` and check the RFC 8628 answer (service-generated `device_code`, distinct from the `user_code`, absent from the person's link, and the sign-in guidance's device text as its `note`). Off by default — it is the validator's only write. |
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

- **Discovery** — `GET /.well-known/best` returns `200` without credentials, `application/json`, root key present, an `ETag` and a `Cache-Control` other than `no-store` (a warning, the spec says should), full JSON-Schema validation against [`discovery.json`](../protocol/v1/schemas/discovery.json), semver version, `io.best.*` capabilities carry `spec`+`schema` URLs, valid `status` values.
- **Multi-tenancy** (when `tenants.manifest` is declared) — template has `{tenantId}`, root capabilities sit on services that declare their own `authentication`, tenant manifest is fully resolved, self-contained, and schema-valid. The root's own capabilities are probed whether or not `--tenant` is given. The tenants root — the `http.endpoint` of a service the root announces for its tenants — answers `401` without a credential, never a bare `404`, and with `--api-key` lists the tenants the credential opens.
- **Manifest Discipline** — every service is the implementing service of a capability (a multi-tenant root may announce a service its tenant manifest declares — confirmed with `--tenant`); no URI template outside `tenants.manifest`; no surface under a pseudo-tenant (`public`, `default`, `anonymous`); manifest descriptions within 500 characters and free of URLs, templates, header names, credential formats and catalogue operation names.
- **Access** — a service that declares `"type": "none"` answers without credentials; a surface that answers without credentials says so in its manifest.
- **Registration** — `deviceAuthorizationUrl` comes with `tokenUrl` and with the [sign-in guidance](../SPEC.md#sign-in-guidance)'s manifest text, verbatim, as `authentication.note` — the words of the version the manifest declares, or of a later one (a failure: required from 0.9.14); `tokenUrl` refuses an unknown `device_code` as a bad grant; with `--probe-registration`, the device authorization answer itself. A service that needs a credential and declares no `deviceAuthorizationUrl` gets a warning: an agent cannot obtain one by itself.
- **Commands** (`active`) — catalogue shape, absolute `dataschema` URIs, `commandType` stated, schema-document retrieval, no internal routing members in served schema documents, no public command that asks its caller to mint a secret, unknown-type rejection with the BEST error format, `application/cloudevents+json` accepted, unknown-schema `404`, a `413` that carries `details.limit_bytes` (the probe sends 1 MiB, a size of the validator's own; a service that reads it has a larger limit or none, and is noted, not judged), and a `429` met on the way carrying `Retry-After`.
- **Events** (`active`) — event list shape, first-event envelope validation, auth enforcement on `GET /events`, a `from` or `to` in another form than RFC 3339 refused with a `400` naming the parameter.
- **Workflows** (declared `active`) — index shape; at least one recipe published; every step of the first recipes resolves through its `dataschema` alone (the blind pass); no recipe instructs the consumer about its own client or configuration.
- **Vocabulary** — no command, query or workflow is named after the person's acts (sign-in, sign-up, sign-out, login, logout).
- **Single entry** — no `/llms.txt` on the origin that restates the BEST surface.
- **Queries** (declared `active`) — catalogue shape, schema document with `response` section, execution, result-vs-declared-schema validation, and the `parameters` schema enforced: an execution it refuses (a required parameter left out, an undeclared one under `additionalProperties: false`, or a value it does not admit) is a `400` whose details name the parameter.

## What is not checked

The report closes with what the conformance list asks that a run cannot see from outside, without writing or without a person's approval: a correlation id bound to the sender that first used it (Conformance item 12), a duplicate command answered as the original or with `409`, the correlation id on every later fact, a token answer with no `tenant_id`, the end of a credential and of its stream, request records, cleartext refused, a forwarded command's body accepted whole, and the `429` answer when the service does not rate-limit the run's commands.

Capabilities with `status: "partial"` or `"planned"` are skipped per the conformance rules; custom (non-`io.best.*`) capabilities are out of checklist scope.

## Development

```bash
npm install
npm run build     # syncs schemas from ../protocol/v1/schemas and compiles
node dist/index.js http://localhost:4810
npm test          # builds, then runs the CLI against an in-process mock service: a clean one and a divergent one
```

The published package embeds the protocol schemas at build time (`scripts/sync-schemas.mjs`), so the CLI validates against exactly the schemas of the spec version it shipped with.
