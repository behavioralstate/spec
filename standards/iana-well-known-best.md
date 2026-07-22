# IANA Registration — `/.well-known/best`

Ready-to-submit registration for the IANA **Well-Known URIs** registry, per [RFC 8615 §3.1](https://www.rfc-editor.org/rfc/rfc8615.html#section-3.1). The registry operates under the *Specification Required* policy with expert review; provisional registrations backed by a stable, publicly retrievable specification are routine (precedents: `mercure`, `nodeinfo`, `open-resource-discovery`).

## How to submit

Submit via the IANA protocol assignment form at <https://www.iana.org/form/protocol-assignment> (or email `iana@iana.org`), pasting the template below. The designated expert reviews for specification availability/stability and security considerations. Submission must come from the change controller.

## Registration template

| Field | Value |
|---|---|
| **URI suffix** | `best` |
| **Change controller** | Riccardo D. — riccardo.d@xml-int.com (Behavioral State Protocol project, <https://behavioralstate.io/>) |
| **Specification document(s)** | BEST — Behavioral State Protocol, Discovery section: <https://github.com/behavioralstate/spec/blob/spec/v0.9.0/SPEC.md#discovery--well-knownbest> (also rendered at <https://behavioralstate.io/specs/discovery>) |
| **Status** | provisional |
| **Related information** | Discovery manifest JSON Schema: <https://behavioralstate.io/v1/schemas/discovery.json> · Protocol repository: <https://github.com/behavioralstate/spec> |

## Expert-review checklist (how the spec satisfies RFC 8615 §3)

- **Format and media type at the URI**: the specification defines the response as a JSON discovery manifest with `Content-Type: application/json`, structure given by prose tables and the linked JSON Schema.
- **URI schemes**: HTTPS. The specification's security requirements mandate TLS for all production endpoints; the well-known resource itself is defined as the only unauthenticated endpoint.
- **Sub-resources**: the specification defines one templated sub-resource, `/.well-known/best/{tenantId}`, returning a tenant-scoped manifest of the same media type (RFC 6570 URI template, declared in the root manifest's `tenants.manifest` field).
- **Stability**: the referenced specification URL is a released git tag (immutable); the change controller updates the registration to newer tags as the spec evolves.

## Upgrade path

When the protocol is published as an RFC (Independent Submission Stream, Informational — see the Internet-Draft in this directory), request an update of **Status** to `permanent` with the RFC as the specification document.
