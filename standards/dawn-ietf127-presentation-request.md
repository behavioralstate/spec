# dawn — presentation request for IETF 127

**DRAFT, not sent.** Answers the chairs' Call for Presentations (Frank Brockners, 2026-10-26): requests to
dawn-chairs@ietf.org by **2026-11-02**, each giving the title and document, why and how it fits the charter, the
deliverable, the time requested, and whether it is presented in person or remotely. The meeting is the WG's first,
Thursday 2026-11-19, two hours.

Plain-text email, sent from the subscribed address.

- **To:** dawn-chairs@ietf.org
- **From:** riccardo@dinuzzo.it
- **Subject:** DAWN at IETF 127: presentation request, /.well-known/best as deployed input to the Discovery Architecture

## Body

> Hello Frank, Dapeng,
>
> I'd like to ask for a 5-minute slot at IETF 127. I'll present remotely.
>
> Title: Discovery from a name, in production: /.well-known/best
> Document: draft-dinuzzo-best-protocol-02
>   https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/
> Deliverable: Discovery Architecture
>
> A BEST-compliant service lets a person tell an AI agent "sign me in to
> example.com", even if the agent has never seen that service. The agent
> fetches https://example.com/.well-known/best, learns what the service
> offers, gets its own credential through the OAuth device flow
> (RFC 8628) while the person approves in their own browser, and starts
> working. It runs in production on three services today.
>
> I would like to show how exposing behaviours can make a service's API
> ready to be used by agents.
>
> Current implementations are mine or my organisation's; the first
> independent one is being built now.
>
> Thanks,
> Riccardo Di Nuzzo

## Notes

Sending it, and what follows, is [#183](https://github.com/behavioralstate/spec/issues/183).

- **The draft:** -02, posted 2026-10-30, is a snapshot of the spec at 0.9.19, so the slides match the cited document.
- **The services, if the chairs ask:** the three production hosts are the owner's to name in the reply (SDLC.md
  section 2 keeps them out of the repository), plus best-peer (Rust, written from the text). The body leaves the
  names out to stay short.
- **Tone:** the chairs asked for requests that are "short, crisp and on-topic", and several requests on the list were
  questioned on scope.
- The earlier list post, [dawn-landscape-email.md](dawn-landscape-email.md) (2026-08-24), had no replies on-list.
