# BEST — Roadmap

This page holds only what is **open**. What has shipped is in the [release notes](RELEASE_NOTES/) and [MIGRATION.md](MIGRATION.md); why things are the way they are is in the [design decisions](specs/design-decisions.md). An item leaves this page when it ships or is dropped.

## Direction

BEST's aim is that a person can name a service to an agent that has never heard of it, and the agent gets from that name to working use by itself. The command / event / query core is stable and in production. The open work is at the edges of first contact: turning a name into a connection, declaring what opens each part of a service, obtaining a credential without a human copying a key, and keeping manifests structural so a generic client — not only a model reading prose — can operate them.

## Protocol

- **Surfaces, credentials and manifest discipline** — *in design.* A manifest cannot yet say that one part of a service needs no credential and another a different one, nor how an agent obtains a credential by itself; and nothing stops the gap being filled with prose. Candidate changes: per-service `authentication`, a structural pointer from `authentication` to a public registration workflow, a described (non-normative) pattern for opening an account and registering an agent, `impact` categories for commands that commit a person or grant access, and normative limits on what a manifest `description` may carry — enforced by `best-validate`.
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
| Register `/.well-known/best` (RFC 8615) | `best` was refused — single common words are reserved for recognised standards bodies. The path is served unregistered, which RFC 8615 permits. The expert's pre-check answer ([well-known-uris#104](https://github.com/protocol-registries/well-known-uris/issues/104)) finds `best-protocol` too generic as well, suggests a spelled-out name, and advises returning once the document is further along its stream. **Open: whether to adopt a distinctive registered name alongside the served path.** |
| Internet-Draft → Informational RFC, Independent Submission Stream | [draft-dinuzzo-best-protocol](https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/) is posted. The ISE has deferred it while the IETF charters work in this space (`dawn`, `agentproto` — both proposed working groups); it reconsiders once they have formed or published, with a "substantial deployment" bar. The draft must be refreshed before it expires and whenever the spec's surface changes. |
| Take part in `dawn` and `agentproto` | First posts are on both lists ([standards/](standards/)). Open: follow the chartering outcome and answer on-list; BEST already meets agentproto's sessionless duplicate/replay requirement, which is worth saying there. |
| W3C Community Group; CNCF sandbox or an IETF WG | Undecided / needs independent implementations. |

## Operational

- **npm trusted publishing (OIDC)** for `best-mcp` and `best-validate` — CI still publishes with a long-lived token.
- **`best-validate` with credentials against every production deployment**, scoped manifests included — root manifests alone have been validated.
- **`correlationid` end to end in every production deployment**, and surfaced by `best-validate`.
