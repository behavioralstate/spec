# best-validate

Conformance validator for **BEST** (Behavioral State Protocol) endpoints. Points at a live endpoint and runs the spec's [conformance checklist](../SPEC.md#conformance) as executable checks: discovery manifest (fetched and validated against the published JSON Schemas), capability declaration rules, per-capability endpoint probes, multi-tenant root-manifest rules, error format, and auth enforcement.

All probes are **non-destructive** — the only POST issued is a command with an intentionally unknown `type`, which a conformant endpoint rejects during validation, before anything is queued.

```bash
npx @behavioralstate/best-validate https://api.example.com
```

Exit code `0` = conformant (warnings allowed), `1` = one or more failures, `2` = internal error.

## Options

| Flag | Description |
|---|---|
| `--legacy-bsp` | Validate a pre-0.9.0 endpoint: `/.well-known/bsp`, root key `bsp`, `io.bsp.*` names; relative `dataschema` URIs are tolerated and reported as warnings. Temporary — will be removed once known deployments migrate. |
| `--api-key <key>` | Credential for authenticated endpoints. Without it, protected routes are only checked for existence (a `401` counts as "route exists, auth enforced"). |
| `--auth-type <t>` | `bearer` \| `apikey` \| `none` — overrides what the manifest declares. |
| `--auth-header <name>` | Header name for `apikey` auth (default `X-Api-Key`, or the manifest's `scheme`). |
| `--auth-in <where>` / `--auth-param <name>` | Query-parameter auth. |
| `--tenant <id>` | For multi-tenant hosts: expands `tenants.manifest`, validates the tenant manifest, and probes its capabilities. |
| `--json` | Machine-readable report (for CI). |
| `--timeout <ms>` | Per-request timeout (default 10000). |

## Examples

```bash
# Public endpoint
best-validate https://api.example.com

# Authenticated multi-tenant host
best-validate https://api.example.com --api-key $KEY --tenant acme

# Pre-migration endpoint, CI mode
best-validate https://api.example.com --legacy-bsp --api-key $KEY --json
```

## What is checked

- **Discovery** — `GET /.well-known/best` returns `200` without credentials, `application/json`, root key present, full JSON-Schema validation against [`discovery.json`](../protocol/v1/schemas/discovery.json), semver version, `io.best.*` capabilities carry `spec`+`schema` URLs, valid `status` values.
- **Multi-tenancy** (when `tenants.manifest` is declared) — template has `{tenantId}`, root declares no tenant-scoped capabilities, tenant manifest is fully resolved, self-contained, and schema-valid.
- **Commands** (`active`) — catalogue shape, absolute `dataschema` URIs, schema-document retrieval, unknown-type rejection with the BEST error format, unknown-schema `404`.
- **Events** (`active`) — event list shape, first-event envelope validation, auth enforcement on `GET /events`.
- **Queries** (declared `active`) — catalogue shape, schema document with `response` section, execution, and result-vs-declared-schema validation.

Capabilities with `status: "partial"` or `"planned"` are skipped per the conformance rules; custom (non-`io.best.*`) capabilities are out of checklist scope.

## Development

```bash
npm install
npm run build     # syncs schemas from ../protocol/v1/schemas and compiles
node dist/index.js http://localhost:4810
```

The published package embeds the protocol schemas at build time (`scripts/sync-schemas.mjs`), so the CLI validates against exactly the schemas of the spec version it shipped with.
