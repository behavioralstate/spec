# BEST — Roadmap and Status

Last updated: 2026-08-29 (0.9.7 released — manifest `extensions`; both IETF list posts sent; I-D `-01` posted; IANA unregistered-use stance adopted).

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
| 1. IANA registration of `/.well-known/best` (provisional, RFC 8615) | [standards/iana-well-known-best.md](standards/iana-well-known-best.md) | **Rejected 2026-08-25** by the designated expert — single common words are reserved for recognised SDOs. `/.well-known/best` is served unregistered (RFC 8615 permits use; registration is collision-avoidance) and registration rides the IETF path. Pre-check for a distinctive suffix (`best-protocol`) filed as [protocol-registries/well-known-uris#104](https://github.com/protocol-registries/well-known-uris/issues/104) (2026-08-29) |
| 2. Internet-Draft → Informational RFC via the Independent Submission Stream | [draft-dinuzzo-best-protocol-00](https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/) | **Posted 2026-08-24**; ISE deferred pending dawn/agentproto chartering — engage those lists (see TODO) |
| 3. Register `/.well-known/best` citing the RFC (the expert's SDO objection dissolves once the spec is in the IETF stream) | — | After step 2 |
| 4. Optional: W3C Community Group for visibility / implementer recruitment | — | Undecided |
| 5. Longer term: CNCF sandbox (natural home given the CloudEvents lineage) or IETF WG | — | Requires adoption + independent implementations |

## TODO

Everything still open, in rough priority order:

**Protocol design**
- [ ] **Retention semantics** — no manifest declaration of retention windows: event pollers can't distinguish "not processed yet" from "already expired", and the idempotency guarantee (SPEC.md: duplicate `id` rejected "within a retention window") references a window no manifest declares. A `retention` declaration on the events capability closes both; needs design discussion. Note: command idempotency/replay protection itself is **already specified** (envelope `id` is the idempotency key; duplicates rejected, `409` on same-`id`-different-payload) — BEST already satisfies agentproto's sessionless duplicate/replay requirement (`draft-feng-agentproto-session-requirements`), a point worth making on that list.
- [ ] Implement 0.9.2 `correlationid` in the deployments (dotquant, remundo) and surface it in `best-validate`. Done in `best-mcp` (2026-08-24): optional `correlation_id` on the send tools, echoed `correlationId` surfaced with event-tool guidance; verified byte-identical behaviour against pre-0.9.2 servers

**Evolution candidates from the IETF BoF landscape** (reviewed 2026-08-24 against the dawn/agentproto drafts; all additive 0.9.x patches):
- [x] **Manifest extension point** — shipped in **0.9.7** as the `extensions` object (manifest root + capability entries), deliberately narrower than first sketched: the governing rule is **domain-first** — anything dynamic, behavioral, or obtainable after authentication is modeled as ordinary capability surface (custom capability, query, event, workflow), and `extensions` exists only for static, discovery-time declarations that must ride in the manifest document itself (indexer-facing facts, future manifest-integrity data, per-element annotations). Reverse-domain keys, core ignores contents, never required for core interaction, manifest-hygiene rule applies. Converts dawn's attestation/capacity/risk-data asks into "extensions BEST accommodates; promoted to core only if a standard defines them". See [design decisions](specs/design-decisions.md#manifest-extensions--one-escape-hatch-domain-first) and [MIGRATION.md](MIGRATION.md#migrating-from-096-to-097).
- [ ] **Security & privacy considerations for manifest content** — prose stating the two-tier visibility model explicitly: the public root manifest stays coarse (no tenant identifiers, internal hostnames, capacity data); fine detail belongs in authenticated tenant manifests. Addresses the dawn gap-analysis enumeration/scraping concern and strengthens the I-D's Security Considerations for resubmission.
- [ ] **Manifest caching guidance** — non-normative: serve `/.well-known/best` with `ETag` + `Cache-Control`. (dawn wants static/dynamic property classification; plain HTTP semantics cover BEST's case.)
- [ ] **`deprecated` capability status** — the lifecycle enum is `planned → partial → active`: birth but no death. Needed the first time a platform sunsets a capability; dawn requires lifecycle info in discovery.
- **Watch, don't build**: cryptographic signing of discovery documents (dawn's anti-poisoning MUST — adopt whatever envelope dawn standardizes rather than inventing one; meanwhile document the TLS-as-trust-anchor stance in design-decisions) and channel-bound identity / verifier binding (agentproto's `-06` security drafts — same logic).
- **Rejected by design**: descriptive/class-based search — that's the registry/directory layer BEST deliberately deleted; BEST manifests are the substrate directories index. Add a positioning sentence to SPEC.md instead of a feature. MoQ transports are orthogonal to the HTTP/JSON binding.

**Standards track** (see table above)
- [x] Submit the IANA registration — sent 2026-08-24 by email to iana@iana.org; **rejected 2026-08-25** by the designated expert (registry policy: single common words / short terms only for recognised SDOs; registry guidelines also require multi-owner repos or significant deployment). `/.well-known/best` continues to be served unregistered — RFC 8615 permits this; registration will be revisited via the IETF path. The I-D `-01` refresh must update its IANA Considerations accordingly
- [x] Submit the Internet-Draft — posted 2026-08-24: <https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/> (expires 2027-02-25). ISE outcome: **deferred, not rejected** — the space is being chartered at the IETF (dawn + agentproto BoFs, IETF 126 in Nov); the ISE reconsiders if no WGs form or after initial RFCs, with a "substantial deployment" bar
- [x] Upload the `-01` refresh — **posted 2026-08-29**: <https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/> (expires 2027-03-02). IANA Considerations rewritten for the registration rejection; snapshot updated to spec 0.9.6 (workflows capability + `impact` annotation). Source: [standards/draft-dinuzzo-best-protocol-01.md](standards/draft-dinuzzo-best-protocol-01.md)
- [x] Engage the IETF BoF lists — **both first posts sent**: dawn 2026-08-24 ([standards/dawn-landscape-email.md](standards/dawn-landscape-email.md) — landscape-draft §4.2 inclusion + gap-analysis text offer) and agentproto 2026-08-29 ([standards/agentproto-intro-email.md](standards/agentproto-intro-email.md) — sessionless/capability-card mapping onto draft-feng, sent ahead of the 2026-09-03 IESG telechat on the dawn charter)
- [ ] Follow up on the list posts — if no on-list reply to the dawn post by ~2026-09-07, write directly to the `draft-jimenez-dawn-discovery-landscape` authors referencing the archive post; watch the 2026-09-03 IESG telechat outcome on the dawn charter; respond to any replies on either list

**Operational**
- [x] `npm deprecate @behavioralstate/bsp-mcp` pointing at `best-mcp` — done manually 2026-08-24
- [ ] npm trusted publishing (OIDC) for `best-mcp`; revoke the bypass-2FA automation token
- [ ] Run `best-validate` to completion with credentials: dotquant tenant-level probes (needs `--tenant` + `--api-key`; root manifest CONFORMANT) and remundo authenticated probes. Remundo host identified 2026-08-24: `dev.api.baas.remundo.com` — root manifest CONFORMANT (0.9.1); tenant `XML-INT` manifest **fails** the 0.9.2 discovery schema (capability entry carries a `push` block — webhook leftover; drop it during the remundo 0.9.2 migration)

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
| spec/v0.9.7 | 2026-08-29 | Optional `extensions` object on the manifest root and capability entries — vendor data gets one lawful home under a domain-first rule (dynamic/behavioral data stays ordinary capability surface) |
| spec/v0.9.6 | 2026-08-26 | Optional `impact` annotation on command catalogue entries + schema documents — high-impact commands (financial/destructive/irreversible/compliance) become discoverable; human-facing consumers warn and confirm before submitting |
| spec/v0.9.5 | 2026-08-26 | `workflows` cross-link consolidated as the single workflow-discoverability mechanism, stamped on schema documents as well as catalogue entries |
| spec/v0.9.4 | 2026-08-26 | Workflows promoted from vendor-extension convention to the Extended capability `io.best.agents.workflows` |
| spec/v0.9.2 | 2026-08-23 | First-class `correlationid` envelope attribute; webhook subscriptions and gRPC transport declaration removed; removed-capability residue deleted; `specs/` pages slimmed |
| spec/v0.9.1 | 2026-07-30 | Command authorisation requirements (deny-by-default, actor binding, high-impact controls); schema selection relaxed to any server-owned identifier; same-identifier rule for selection/authz/dispatch. No wire change |
| spec/v0.9.0 | 2026-07-22 | BSP → BEST rename; conformant CloudEvents 1.0 profile; MIGRATION.md; standards artifacts |
| spec/v0.8.1 | 2026-07-22 | Consolidated SPEC.md; example `dataschema` fixes; OpenAPI synced with spec surface |
| spec/v0.8.0 | 2026-07 | A2A transport binding removed |
