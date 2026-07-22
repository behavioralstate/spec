# BEST — Roadmap and Status

Last updated: 2026-07-22 (post spec/v0.9.0).

## Where the protocol stands

**v0.9.0** (current stable) was a deliberate identity-and-conformance release, executed as one breaking migration:

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

## Near-term operational items

- [ ] `npm deprecate @behavioralstate/bsp-mcp` pointing at the new package
- [ ] Migrate dotquant.io and remundo.com endpoints to the 0.9.0 surface ([MIGRATION.md](MIGRATION.md) checklist)
- [ ] Submit the IANA registration (step 1 above)
- [ ] Complete the I-D conversion and submit to the Datatracker + ISE
- [ ] Consider npm trusted publishing (OIDC) for `best-mcp`; revoke the bypass-2FA token

## Open protocol-evolution decisions

Identified during the 2026-07 review; none are scheduled yet. Ordered by expected value:

1. **`best-validate` conformance CLI** — ✅ built ([validate-cli/](validate-cli/)): executable conformance checklist with schema validation, non-destructive probes, multi-tenant support, `--json` for CI, and a temporary `--legacy-bsp` mode for pre-0.9.0 endpoints (remove once dotquant/remundo migrate). Remaining: publish to npm as `@behavioralstate/best-validate` (needs a CI job + tag convention), then run it against both live endpoints.
2. **Correlation and retention semantics** — the one real hole in the async story: no protocol-level correlation field inside event payloads (generic consumers can't reliably match events to commands across services), and no manifest declaration of event retention (pollers can't distinguish "not processed yet" from "already expired"). Genuine protocol change; needs design discussion.
3. **Webhook signature specification** — pin down header name, algorithm, and signed content for the subscription HMAC `secret`; without it, no two implementations can verify each other's deliveries.
4. **gRPC transport decision** — declared in the discovery schema with no normative binding, no implementation, no known consumer. The same logic that removed the A2A binding argues for removing it until a real deployment needs it.
5. **Cleanup** — removed-capability residue still shipping (`specs/agents/memory.md`, `registry.md`, `lifecycle.md`, `memory.json` schema); `GET /subscriptions/{id}` referenced in a schema `$def` but defined nowhere; decide whether `specs/` pages get reduced now that SPEC.md is canonical (the website builds from `specs/`).

## Release history (recent)

| Version | Date | Highlights |
|---|---|---|
| spec/v0.9.0 | 2026-07-22 | BSP → BEST rename; conformant CloudEvents 1.0 profile; MIGRATION.md; standards artifacts |
| spec/v0.8.1 | 2026-07-22 | Consolidated SPEC.md; example `dataschema` fixes; OpenAPI synced with spec surface |
| spec/v0.8.0 | 2026-07 | A2A transport binding removed |
