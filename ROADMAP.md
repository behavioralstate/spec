# BEST — Roadmap

This page holds only what is **open**. What has shipped is in the [release notes](RELEASE_NOTES/) and [MIGRATION.md](MIGRATION.md); why things are the way they are is in the [design decisions](specs/design-decisions.md). An item leaves this page when it ships or is dropped.

## Direction

BEST's aim is that a person can name a service to an agent that has never heard of it, and the agent gets from that name to working use by itself. The command / event / query core is stable and in production. The specification now says how a name becomes a manifest, what opens each part of a service, how an agent obtains its own credential, and what keeps a manifest structural. The open work is making that real: enforcement, the reference client, and the services in production.

## Protocol

- **0.10.0 — enforcement.** 0.9.11 states Manifest Discipline, the single entry, the pseudo-tenant rule and `application/cloudevents+json`; 0.10.0 makes them required, puts the 500-character limit into the discovery schema, and turns the validator's warnings into failures.
- **`best-validate` for 0.9.11** — the new checks: a service no capability references, templates and pseudo-tenants, access declared versus access served, the registration endpoints (the write probe opt-in), descriptions carrying mechanics, a second entry document, and a blind pass that strips every description and reports what can no longer be reached.
- **Agent registration in `best-mcp`** — start at `authentication.deviceAuthorizationUrl` instead of looking for an onboarding service; send `agent_label`; keep claiming the credential outside the model's view. Prefer `commandType`; send `application/cloudevents+json`.
- **Name resolution in `best-mcp`** — SPEC.md *Name Resolution* makes a DNS name the whole namespace; the reference client is the missing resolver. Design: a `connect` tool that resolves a name and **returns what it resolved without connecting**, opening the connection only on a second call carrying the person's confirmation — so the confirmation is a step a model cannot skip. Open: whether the `_best` TXT step earns its complexity; whether resolved connections persist across sessions or only their credentials do; how `best-validate` checks that a name resolves.
- **Retention semantics** — no manifest declares a retention window, so an event poller cannot tell "not processed yet" from "already expired", and the idempotency guarantee refers to a window nothing states. A `retention` declaration on the events capability would close both.
- **`deprecated` capability status** — the lifecycle is `planned → partial → active`: birth but no death.
- **Manifest visibility and caching** — prose for the two-tier model (coarse public root, fine detail in authenticated scoped manifests), and non-normative `ETag` / `Cache-Control` guidance.
- **Watching, not building** — signing of discovery documents and channel-bound identity: adopt what the IETF work standardises rather than invent. TLS is the trust anchor meanwhile.
- **Rejected by design** — search by category. That is a directory; a directory is a BEST service like any other, and manifests are what it indexes.

## Standards track

The bar for everything beyond the first two rows is an implementation the spec's author did not write.

| Step | State |
|---|---|
| Register `/.well-known/best` (RFC 8615) | `best` was refused — single common words are reserved for recognised standards bodies. The path is served unregistered, which RFC 8615 permits. The expert's pre-check answer ([well-known-uris#104](https://github.com/protocol-registries/well-known-uris/issues/104)) finds `best-protocol` too generic as well, suggests a spelled-out name, and advises returning once the document is further along its stream. **Decided: the name stays `best`** — a spelled-out name has two correct spellings, and a mistyped discovery path fails silently ([design decisions](specs/design-decisions.md#the-well-known-name-stays-best)). Registration is requested again with the RFC. Open: answer the pre-check with that reasoning. |
| Internet-Draft → Informational RFC, Independent Submission Stream | [draft-dinuzzo-best-protocol](https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/) is posted. The ISE has deferred it while the IETF charters work in this space (`dawn`, `agentproto` — both proposed working groups); it reconsiders once they have formed or published, with a "substantial deployment" bar. The draft must be refreshed before it expires and whenever the spec's surface changes — **0.9.11 changes it; a refresh is due.** |
| Take part in `dawn` and `agentproto` | First posts are on both lists ([standards/](standards/)). Open: follow the chartering outcome and answer on-list; BEST already meets agentproto's sessionless duplicate/replay requirement, which is worth saying there. |
| W3C Community Group; CNCF sandbox or an IETF WG | Undecided / needs independent implementations. |

## Operational

- **npm trusted publishing (OIDC)** for `best-mcp` and `best-validate` — CI still publishes with a long-lived token.
- **`best-validate` with credentials against every production deployment**, scoped manifests included — root manifests alone have been validated.
- **`correlationid` end to end in every production deployment**, and surfaced by `best-validate`.
- **Production deployments onto 0.9.11** — registration through the device authorization endpoint, public surfaces off their pseudo-tenant, descriptions shortened, internal names out of served schemas.
