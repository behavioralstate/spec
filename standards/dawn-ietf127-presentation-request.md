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
> I'd like to request a short slot at the IETF 127 meeting.
>
> Title: What a client needs once it has the address: /.well-known/best
> from deployment
> Document: draft-dinuzzo-best-protocol-02
>   https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/
> Deliverable: Discovery Architecture
> Time: 5 minutes
> Presenting: remotely
>
> Why it fits the charter: this week's thread on what "discovery" covers
> (Artur Hecker's circular dependency, Éric's reply that discovery is how
> to connect to an agent from the organisation's name) comes down to where
> the minimum public discovery information stops and a protocol's own
> description starts. BEST is one data point for that boundary, from
> running code. Its whole entry point is one HTTPS URL at a well-known
> location; everything after it (the service's commands, events and
> queries with their schemas, how a credential is obtained through
> RFC 8628, which tenants exist) is the protocol's own and stays out of
> discovery. So for a self-describing protocol the minimum discovery
> information can be very small: a protocol identifier and a URL.
>
> The talk would show that boundary as deployed, and what we found
> missing at it, which is input to the architecture rather than a
> request for adoption: no integrity for the discovery document beyond
> TLS, and nothing that helps a client find a service it cannot already
> name.
>
> Implementation status, stated plainly: three production services and
> one implementation written from the specification text alone, sharing
> no code with the others, all by the same author or organisation. The
> first implementation by someone else, a small public website, is being
> built now; -02 records it as in progress.
>
> Thank you,
> Riccardo Di Nuzzo
> riccardo@dinuzzo.it

## Notes

Sending it, and what follows, is [#183](https://github.com/behavioralstate/spec/issues/183).

- **The draft:** -02, posted 2026-10-30, is a snapshot of the spec at 0.9.19, so the slides match the cited document.
- **The services, if the chairs ask:** the three production hosts are the owner's to name in the reply (SDLC.md
  section 2 keeps them out of the repository), plus best-peer (Rust, written from the text). The body leaves the
  names out to stay short.
- **Tone:** the chairs asked for requests that are "short, crisp and on-topic", and several requests on the list were
  questioned on scope. That is why the body offers BEST as an example of the boundary, not as a solution for DAWN to
  adopt.
- The earlier list post, [dawn-landscape-email.md](dawn-landscape-email.md) (2026-08-24), had no replies on-list.
