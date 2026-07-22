# Migrating from 0.8.x to 0.9.0

Spec 0.9.0 makes two coordinated breaking changes: the protocol short name is renamed **BSP → BEST** (the full name *Behavioral State Protocol* is unchanged), and the message envelope becomes a **conformant CloudEvents 1.0 profile**. This page lists everything an implementation must change.

## Endpoint implementers (services)

| # | Change | Before (0.8.x) | After (0.9.0) |
|---|---|---|---|
| 1 | Well-known discovery path | `GET /.well-known/bsp` | `GET /.well-known/best` |
| 2 | Manifest root key | `{ "bsp": { ... } }` | `{ "best": { ... } }` |
| 3 | Capability / service namespace | `io.bsp.agents.*` | `io.best.agents.*` |
| 4 | Tenant manifest template | `/.well-known/bsp/{tenantId}` | `/.well-known/best/{tenantId}` |
| 5 | `dataschema` on the wire | Relative `{schema}/{version}` accepted | Absolute catalogue URI, e.g. `https://api.example.com/commands/propose-counter/1.0` |
| 6 | Unknown envelope attributes | Rejected (`additionalProperties: false`) | **Ignored** — never reject a message for carrying unknown attributes |
| 7 | `source` field | Any string | URI-reference (RFC 3986) — bare names/routing keys remain valid; strings with spaces or invalid URI characters are not |

Unchanged: all capability endpoint paths (`/commands`, `/events`, `/queries`, `/subscriptions`), status codes, catalogue shapes, auth declaration, tenant routing rules, and the server-side validation model (validate by `type` against your own catalogue; never fetch the caller's `dataschema` URI).

> **Transition alias (non-normative):** a host **may** continue serving the old `/.well-known/bsp` path and accepting relative `dataschema` values during a migration window. Only the new forms are conformant with 0.9.0; the alias is a courtesy to un-migrated clients and should be removed once callers have moved.

## Clients and callers

1. Discover at `/.well-known/best`; read the manifest root key `best`.
2. Look up capabilities under `io.best.agents.*`.
3. Send commands with the absolute `dataschema` taken verbatim from the command catalogue entry.
4. Ignore unknown envelope attributes on received events (required behaviour, and now consistent with the versioning forward-compatibility rule).
5. BEST messages are valid CloudEvents 1.0 — CloudEvents SDKs and brokers may now be used directly, with no envelope adaptation.

## bsp-mcp → best-mcp

The reference MCP server is republished as [`@behavioralstate/best-mcp`](https://www.npmjs.com/package/@behavioralstate/best-mcp) (2.0.0); `@behavioralstate/bsp-mcp` is deprecated on npm.

- Env vars are now `BEST_*` (`BEST_<APP>_BASE_URL`, `BEST_ENDPOINT`, `BEST_CONNECTIONS`, …). Legacy `BSP_*` names still work as a deprecated fallback and log a startup warning.
- `send_command` now sets `dataschema` to the absolute catalogue URI automatically — no caller change needed.
- MCP tool names are unchanged.

## Known deployments checklist

For each endpoint (e.g. dotquant.io, remundo.com):

- [ ] Serve the manifest at `/.well-known/best` with root key `best` and `io.best.agents.*` capability names (keep `/.well-known/bsp` as a temporary alias if third-party callers exist)
- [ ] Emit absolute `dataschema` URIs on published events (typed events only)
- [ ] Accept absolute `dataschema` on inbound commands; tolerate the relative form during the transition window if old clients remain
- [ ] Stop rejecting unknown envelope attributes
- [ ] Update MCP client configs to `@behavioralstate/best-mcp` (or rely on the `BSP_*` fallback until convenient)
