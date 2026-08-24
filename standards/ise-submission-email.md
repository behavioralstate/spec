# ISE Submission Email — draft-dinuzzo-best-protocol-00

Send **after** the draft is accepted at <https://datatracker.ietf.org/submit/> (the upload confirmation email arrives first; the draft page goes live at <https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/>).

- **To:** rfc-ise@rfc-editor.org
- **From:** riccardo@dinuzzo.it (must match the author address in the draft)
- **Subject:** Independent Submission request: draft-dinuzzo-best-protocol-00

## Body

> Dear Independent Submissions Editor,
>
> I would like to request consideration of draft-dinuzzo-best-protocol-00,
> "BEST: The Behavioral State Protocol", for publication as an Informational
> RFC via the Independent Submission Stream.
>
> https://datatracker.ietf.org/doc/draft-dinuzzo-best-protocol/
>
> BEST is a discovery-first, behaviour-oriented interaction protocol for
> domain services, defined as a conformant profile of CloudEvents 1.0 over
> HTTP. Services self-describe through a manifest at the well-known URI
> /.well-known/best; clients express intent as commands, observe facts as
> events, and correlate outcomes through a correlation attribute that is
> propagated across command/event chains.
>
> Context for the submission:
>
> - The protocol is developed in the open at
>   https://github.com/behavioralstate/spec with a rendered specification
>   at https://behavioralstate.io/. The draft corresponds to released
>   specification version 0.9.2 (an immutable git tag).
> - It is deployed in production on two platforms (dotquant.io and
>   remundo.com), and a conformance validator is
>   published as @behavioralstate/best-validate on npm.
> - A provisional registration of the "best" well-known URI suffix has
>   been requested in the IANA Well-Known URIs registry per RFC 8615;
>   the draft's IANA Considerations section requests the upgrade of that
>   registration to permanent upon publication.
> - This is an individual submission; the work has not been proposed to
>   an IETF working group. Informational status is sought to document the
>   protocol for the community and to provide a stable specification
>   reference for the IANA registration.
>
> I am the sole author and there are no known IPR claims on this
> document.
>
> Thank you for your consideration.
>
> Riccardo Di Nuzzo
> riccardo@dinuzzo.it

## Notes

- The ISE process and expectations: <https://www.rfc-editor.org/about/independent/>
- Expect an acknowledgement, then an editorial/technical review round; -01 revisions are uploaded through the same Datatracker submit page.
- IPR: if any patent claims ever surface, disclose via <https://datatracker.ietf.org/ipr/>.
