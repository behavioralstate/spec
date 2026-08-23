# BEST — Roadmap and Status

Last updated: 2026-08-23 (post spec/v0.9.2).

## Where the protocol stands

**v0.9.2** (current stable) adds the one thing the async story was missing and continues the shrinking-core trajectory. Added: **first-class correlation** — a `correlationid` CloudEvents extension attribute, optional on commands (defaults to the command `id`), mandatory on events produced by a command, propagated across process chains. Removed: the webhook push channel (`POST /subscriptions`, `push.webhook`, the unspecified HMAC `secret`, the SSRF requirements), the never-specified `grpc` transport declaration, and the residue of previously removed capabilities (the memory/registry/lifecycle tombstone pages and `memory.json`). Push delivery is SSE + MCP notifications; polling remains the universal fallback. See [MIGRATION.md](MIGRATION.md#migrating-from-091-to-092) and the [design decisions](specs/design-decisions.md#webhook-subscriptions-removed). Both production deployments are fully on 0.9.x; the dotquant root manifest validates CONFORMANT with `best-validate`.

**v0.9.1** is a security-surface release with no wire-format change. It fills the largest remaining gap — the spec described *how* to authenticate a caller but almost nothing about authorising an individual command, leaving the Read/Write scope table as the whole model. 0.9.1 adds deny-by-default per-command policy, actor binding (payload fields naming a principal carry no authority), and controls for destructive commands. It also **relaxes** the 0.9.0 rule that schema selection be keyed by `type`: the security control was always *don't dereference the caller's URI*, never *which server-owned identifier keys the lookup*, and the stricter wording had pushed implementations into lossy PascalCase↔kebab-case derivations that silently split authorisation from validation. See [MIGRATION.md](MIGRATION.md#migrating-from-090-to-091).

**v0.9.0** was a deliberate identity-and-conformance release, executed as one breaking migration:

- **Renamed BSP → BEST** (BEhavioral STate; the full name *Behavioral State Protocol* is unchanged). Rationale: "BSP" collides heavily inside computing (Binary Space Partitioning, Board Support Package, Bulk Synchronous Parallel); "BEST" is memorable, positions naturally against REST, and `/.well-known/best` plus the npm names were free.
- **Became a conformant CloudEvents 1.0 profile.** Every valid BEST message is a valid CloudEvents 1.0 message. The former deviations were resolved: `dataschema` is the absolute catalogue URI on the wire, `source` is a URI-reference, unknown envelope attributes are ignored rather than rejected. PascalCase `type` and JSON-only content remain as profile *restrictions*. See [design decisions](specs/design-decisions.md#cloudevents-conformance).
- **Consolidated the spec** into the single-file [SPEC.md](SPEC.md) (added in 0.8.1), with [MIGRATION.md](MIGRATION.md) covering the 0.8.x → 0.9.0 changes.
- Reference MCP server republished as [`@behavioralstate/best-mcp`](https://www.npmjs.com/package/@behavioralstate/best-mcp) 2.0.0 (legacy `BSP_*` env vars accepted as deprecated fallback).

Two production deployments exist (dotquant.io, remundo.com) — one implementer, two codebases.

## Standards track

The goal is legitimacy through the lightweight, achievable venues first; full standards-track (IETF WG / W3C Recommendation) is deliberately deferred until at least one implementation exists that the spec author did not write.

| Step | Artifact | Status |
|---|---|---|
| 1. IANA registration of `/.well-known/best` (provisional, RFC 8615) | [standards/iana-well-known-best.md](standards/iana-well-known-best.md) — ready to submit | **Waiting on submission** (must come from the change controller) |
| 2. Internet-Draft → Informational RFC via the Independent Submission Stream | [standards/draft-best-protocol-00.md](standards/draft-best-protocol-00.md) — skeleton with TODO sections | Skeleton done; full SPEC.md → I-D conversion pending |
| 3. Upgrade IANA entry to `permanent` citing the RFC | — | After step 2 |
| 4. Optional: W3C Community Group for visibility / implementer recruitment | — | Undecided |
| 5. Longer term: CNCF sandbox (natural home given the CloudEvents lineage) or IETF WG | — | Requires adoption + independent implementations |

## TODO

Everything still open, in rough priority order:

**Protocol design**
- [ ] **Retention semantics** — no manifest declaration of event retention: pollers can't distinguish "not processed yet" from "already expired". A `retention` declaration on the events capability would close it; needs design discussion. (The correlation half of this item shipped in 0.9.2 — see below.)
- [ ] Implement 0.9.2 `correlationid` in the deployments (dotquant, remundo) and surface it in `best-mcp` / `best-validate`

**Standards track** (see table above)
- [ ] Submit the IANA registration — text is ready in [standards/iana-well-known-best.md](standards/iana-well-known-best.md); must come from the change controller
- [ ] Complete the SPEC.md → I-D conversion in [standards/draft-best-protocol-00.md](standards/draft-best-protocol-00.md) (12 TODO sections) and submit to the Datatracker + ISE

**Operational**
- [ ] `npm deprecate @behavioralstate/bsp-mcp` pointing at `best-mcp` — attempted 2026-08-23, blocked: the local npm token is invalid; needs `npm login` first
- [ ] npm trusted publishing (OIDC) for `best-mcp`; revoke the bypass-2FA automation token
- [ ] Run `best-validate` to completion: dotquant tenant-level probes (needs `--tenant` + `--api-key`; root manifest already CONFORMANT) and the remundo endpoint (root host still to identify — 404 on `remundo.com` and `api.remundo.com`)
- [ ] Remove `--legacy-bsp` from [validate-cli/](validate-cli/) — both deployments are on 0.9.x, so the mode is dead

## Recently resolved (2026-08-23)

- **Correlation is first-class** — new `correlationid` envelope attribute (CloudEvents extension): optional on commands, mandatory on events produced by a command, propagated across process chains; [design decisions](specs/design-decisions.md#correlation-becomes-first-class), [MIGRATION.md](MIGRATION.md#migrating-from-091-to-092)
- **`specs/` pages slimmed** — discovery, commands, events, queries, and MCP transport reduced to concise references with normative pointers into [SPEC.md](SPEC.md) (~1,400 lines dropped); unique content (design decisions, composing processes, comparisons) untouched
- **Webhooks removed** — resolved the open "webhook signature specification" question by deleting the channel; [design decisions](specs/design-decisions.md#webhook-subscriptions-removed), [MIGRATION.md](MIGRATION.md#migrating-from-091-to-092)
- **gRPC transport declaration removed** — [design decisions](specs/design-decisions.md#grpc-transport-removed)
- **Removed-capability residue deleted** — memory/registry/lifecycle tombstones and `memory.json`; vocabulary lives in the [registry worked example](specs/composing-processes.md#worked-example-a-service-registry-with-heartbeat)
- **Both deployments migrated to 0.9.x** (dotquant.io, remundo.com); dotquant root manifest validated CONFORMANT with [`best-validate`](https://www.npmjs.com/package/@behavioralstate/best-validate) 0.1.0

## Release history (recent)

| Version | Date | Highlights |
|---|---|---|
| spec/v0.9.2 | 2026-08-23 | First-class `correlationid` envelope attribute; webhook subscriptions and gRPC transport declaration removed; removed-capability residue deleted; `specs/` pages slimmed |
| spec/v0.9.1 | 2026-07-30 | Command authorisation requirements (deny-by-default, actor binding, high-impact controls); schema selection relaxed to any server-owned identifier; same-identifier rule for selection/authz/dispatch. No wire change |
| spec/v0.9.0 | 2026-07-22 | BSP → BEST rename; conformant CloudEvents 1.0 profile; MIGRATION.md; standards artifacts |
| spec/v0.8.1 | 2026-07-22 | Consolidated SPEC.md; example `dataschema` fixes; OpenAPI synced with spec surface |
| spec/v0.8.0 | 2026-07 | A2A transport binding removed |
