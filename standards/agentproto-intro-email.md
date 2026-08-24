# agentproto Mailing List Post — sessionless interaction + capability cards

First post to the agentproto list. Goal: position BEST as deployed running
code for the *interaction* side (the REST-contrast argument lives here, per
2026-08-24 discussion — dawn got the neutral discovery framing). Maps BEST
onto draft-feng-agentproto-session-requirements-02 (sessionless model,
capability cards) and draft-rosenberg-agentproto-usecases-00 (agent-to-API
class, cross-domain). Plain-text email, no HTML.

Send a few days after the dawn post (sent 2026-08-24) — don't blast both
lists the same day. First post from this address to an IETF list already
confirmed via the dawn loop, so no re-confirmation expected for ietf.org
infrastructure; a first-post moderation hold on this list is still possible.

- **To:** agentproto@ietf.org
- **From:** riccardo@dinuzzo.it
- **Subject:** Deployment experience with a sessionless, behavior-oriented interaction surface (re: draft-feng-agentproto-session-requirements)

## Body

> Hello agentproto,
>
> I'm Riccardo Di Nuzzo, author of BEST (the Behavioral State Protocol),
> a discovery-first interaction protocol for domain services defined as a
> conformant profile of CloudEvents 1.0 over HTTP:
>
> https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/
> https://behavioralstate.io/ (spec + rendered docs)
>
> It is deployed in production on two platforms (dotquant.io and
> remundo.com). I'd like to offer its deployment experience as input to
> the requirements discussion, because BEST takes a deliberate stance
> that seems relevant to this group's scope.
>
> Most service surfaces agents interact with today are REST-shaped:
> resource endpoints plus CRUD verbs, with the semantics of side effects
> left implicit in the resource model. BEST inverts that. The surface an
> agent discovers and interacts with is behavioral: commands (expressions
> of intent, the only side-effectful operations) and events (immutable
> facts the service emits), each with versioned JSON Schemas published in
> a manifest at /.well-known/best. An agent doesn't infer what a service
> can do from its resource layout — the service states it.
>
> Mapping this onto draft-feng-agentproto-session-requirements-02:
>
> - Capability cards: the draft keeps the card format-agnostic. BEST's
>   manifest is a deployed instance of one — capabilities, command and
>   event schemas, versioning, all behind a predictable well-known URI.
>
> - Sessionless interaction: this is exactly BEST's model. Every command
>   is an atomic, self-contained CloudEvents envelope carrying full
>   context; there is no session state on either side.
>
> - Duplicate/replay protection: the command id is the idempotency key.
>   Retrying the same id is safe and converges on the same outcome; the
>   same id with a different payload is rejected with 409. This is
>   normative in the spec, not an implementation convention.
>
> - Explicit side-effect handling: side effects exist only behind
>   commands. Outcomes are observed, not returned — a command is
>   acknowledged (201), and the events it causes carry a mandatory
>   correlationid propagated across the whole command/event chain, so an
>   agent can correlate intent to outcome asynchronously and across
>   retries.
>
> On draft-rosenberg-agentproto-usecases-00: BEST sits mainly in the
> agent-to-API(tools) class, with the discovery and async-task-
> correlation pieces built in. The draft's critique of current tool
> protocols (single-host orientation, weak inter-domain story) is the
> gap BEST's design targets: the manifest is per-origin, retrieved over
> TLS, with no shared registry or broker — an agent can walk up to any
> conforming host across trust domains and interact through the same
> discovery + command/event surface.
>
> Happy to contribute text to the requirements draft from this
> experience — in particular on idempotency/replay semantics and on
> correlation of asynchronous outcomes, where having production traffic
> has taught us the most.
>
> Riccardo Di Nuzzo
> riccardo@dinuzzo.it

## Notes

- draft-feng-agentproto-session-requirements checked 2026-08-24: at -02
  (2026-08-20), active. Re-check the revision before sending and update
  the "-02" references if it revved.
- draft-rosenberg-agentproto-usecases-00 last checked 2026-08-24.
- Context: dawn charter on IESG telechat 2026-09-03 with sufficient
  positions to pass; dawn's charter explicitly EXCLUDES post-discovery
  communications — that scope boundary pushes interaction-model work
  (BEST's command/event surface) squarely into agentproto's lane, which
  this post can lean on if the scope question comes up in replies.
- MoQ-transport cluster on this list is orthogonal to BEST (HTTP/JSON);
  don't engage it in the first post.
