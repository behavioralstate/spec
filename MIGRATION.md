# Migration Guide

- [0.9.0 → 0.9.1](#migrating-from-090-to-091) — command authorisation requirements; schema selection relaxed
- [0.8.x → 0.9.0](#migrating-from-08x-to-090) — BSP → BEST rename; conformant CloudEvents 1.0 profile

---

# Migrating from 0.9.0 to 0.9.1

Spec 0.9.1 changes **no wire format** — hence a patch bump. It **relaxes** one requirement and **adds** normative requirements around authorising commands. Nothing a 0.9.0 client sends becomes invalid, and no client change is needed; some 0.9.0 *servers* will find they were relying on behaviour the spec now names as wrong.

## Relaxed — schema selection

0.9.0 required servers to select the validation schema "keyed by the command `type` field". 0.9.1 requires only that the schema come from the server's **own catalogue**, and permits the lookup to be keyed by `type` **or** by the schema name carried in `dataschema`.

This restores the intent of the original requirement. The security control was always *don't dereference a caller-supplied URI* — not *which server-owned identifier keys the lookup*. `dataschema` is best understood as a **selector, not a location**.

- A server already keying on `type` is **unchanged and still conformant**. No action needed.
- A server that wants to key on the catalogue schema name may now do so.
- Both MUST-NOT-fetch rules are unchanged and still apply.

## Added — one identifier, or a total mapping

| # | Requirement | Why it is new |
|---|---|---|
| 1 | Schema selection, authorisation, and dispatch **MUST** key on the same identifier | Authorising under one identifier while validating or dispatching under another is a confused-deputy vulnerability |
| 2 | A derivation between `type` and `schema` **MUST** be total and unambiguous over the catalogue, or the identifier **MUST** be resolved once and reused | PascalCase↔kebab-case transforms are commonly lossy; the failure is silent |
| 3 | Where `type` and `dataschema` disagree, a server **MUST NOT** satisfy one decision from each | Reject, or resolve from one field consistently and log the divergence |
| 4 | A command whose schema cannot be resolved **MUST** be rejected | Forwarding unvalidated is not an acceptable fallback |
| 5 | Servers **MUST** document their version policy, and not partially honour a declared version | A silently substituted version dead-ends downstream handlers |

**If you derive one identifier from the other, check the transform now.** The usual symptom is a policy error naming an operation the operator never configured — a correctly permitted command denied because the authorisation key and the schema key diverged.

## Added — command authorisation

`POST /commands` is one endpoint for every operation a service accepts, and those operations do not share a blast radius. Coarse Read/Write scopes are no longer sufficient on their own.

| # | Requirement | Level |
|---|---|---|
| 6 | Per-command policy per credential/service/role, evaluated on every submission | SHOULD |
| 7 | Policy is **deny-by-default**; an empty policy MUST NOT mean "allow everything" | MUST |
| 8 | Policy scoped to the deployment it governs (a shared policy grants prod access as a side effect of enabling a command in test) | MUST |
| 9 | `GET /commands` reflects what the authenticated caller may actually submit | SHOULD |
| 10 | Actor fields in `data` MUST NOT be treated as authenticated identity; acting-principal fields are rejected-on-mismatch or overwritten (overwriting preferred) | MUST |
| 11 | A field naming a subject other than the caller MUST have the caller's access to that subject authorised | MUST |
| 12 | Authorisation MUST NOT be inferred from the payload validating | MUST |
| 13 | Destructive/irreversible/compliance-bypassing commands SHOULD require a control beyond the credential, and that control MUST NOT be self-serviceable | SHOULD / MUST |
| 14 | A log-only approval mode MUST NOT be the default, and the active mode MUST be discoverable by operators | MUST |

## Clients and callers

No changes. `dataschema` remains required and remains the absolute catalogue URI.

---

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

Unchanged: all capability endpoint paths (`/commands`, `/events`, `/queries`, `/subscriptions`), status codes, catalogue shapes, auth declaration, tenant routing rules, and the server-side validation model (validate against your own catalogue; never fetch the caller's `dataschema` URI).

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
