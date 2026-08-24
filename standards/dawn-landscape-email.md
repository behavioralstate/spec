# dawn Mailing List Post — landscape survey inclusion + gap-analysis offer

**SENT 2026-08-24** from riccardo@dinuzzo.it via Gmail (plain-text mode).
Body below matches the sent version, including the "rather than enumerating
resource endpoints" framing added at send time. The full REST-contrast
positioning is deliberately reserved for the agentproto post.

First post to the dawn list. Goals: (1) get /.well-known/best added to the
host-level self-description category of draft-jimenez-dawn-discovery-landscape,
(2) offer deployment-experience text for the empty /.well-known section of
draft-moussa-dawn-gap-analysis. Plain-text email, no HTML.

- **To:** dawn@ietf.org
- **From:** riccardo@dinuzzo.it (the address subscribed to the list — posts from other addresses are held for moderation)
- **Subject:** /.well-known/best — an addition to draft-jimenez-dawn-discovery-landscape, Section 4.2

## Body

> Hello dawn,
>
> I'm Riccardo Di Nuzzo, author of BEST (the Behavioral State Protocol),
> a discovery-first interaction protocol for domain services defined as a
> conformant profile of CloudEvents 1.0 over HTTP:
>
>   https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/
>   https://behavioralstate.io/  (spec + rendered docs)
>
> Services self-describe through a manifest at /.well-known/best: rather
> than enumerating resource endpoints, the manifest describes behavior —
> the commands the service accepts and the events it emits, with
> versioned JSON Schemas for both.
> It is deployed in production on two platforms today (dotquant.io and
> remundo.com), and a conformance validator is published as
> @behavioralstate/best-validate on npm.
>
> Two concrete points for the group's current documents:
>
> 1. draft-jimenez-dawn-discovery-landscape-00, Section 4.2 (Host-Level
>    Self-Description) surveys api-catalog (RFC 9727), A2A agent cards,
>    MCP, and ANP agent descriptions. BEST is a deployed mechanism in
>    exactly this category, and I'd like to suggest adding it. Proposed
>    text, in the section's style:
>
>       BEST (Behavioral State Protocol) [I-D.dinuzzo-best-protocol]
>       defines /.well-known/best as the entry point for a manifest
>       describing a host's behavioral capabilities: the commands a
>       service accepts and the events it emits, each with versioned
>       JSON Schemas. The manifest is a plain JSON document retrieved
>       over HTTPS; integrity and authenticity rely on TLS, and no
>       registry or directory layer is defined by design.
>
>    Happy to adjust the wording to whatever the authors prefer.
>
> 2. draft-moussa-dawn-gap-analysis-01 marks its HTTP /.well-known
>    section as "to be completed". I'd be glad to contribute text there
>    from deployment experience — including the gaps we see from the
>    operator side: no signing of the discovery document beyond TLS, no
>    descriptive/class-based search (a client must already know the
>    host), and the enumeration/privacy considerations of publishing a
>    capability manifest at a well-known location.
>
> On the requirements discussion (draft-king-dawn-requirements): BEST
> currently satisfies the predictable-entry-point, capability-description,
> versioned-schema, and decentralized/no-registry requirements, and I'm
> happy to share where it deliberately stops short (signing, attestation,
> capacity data) if that's useful input to the charter scoping.
>
> Riccardo Di Nuzzo
> riccardo@dinuzzo.it

## Notes

- Post from the subscribed address or it sits in the moderation queue.
- If no response on-list after ~2 weeks, a polite direct follow-up to the
  landscape draft authors (Jaime Jimenez et al.) referencing the list post
  is normal practice.
- Follow-up contribution queued separately: agentproto post mapping the
  BEST manifest onto draft-feng-agentproto-session-requirements' capability
  cards and its sessionless interaction model (command id + correlationid).
- Landscape survey checked 2026-08-24: still at -00, no BEST mention.
  Gap analysis at -01 (expires 14 Dec 2026).
