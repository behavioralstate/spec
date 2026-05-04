# OAP — CQRS + Event Sourcing

The authoritative CQRS/ES design is documented in `specs/`. This file is a historical record of the refactor decisions — read it for context only.

## Key Decisions (settled — do not revisit)

- Commands go **in** to a service; events come **out**. `GET /commands` is a catalogue, not a log.
- CloudEvent 1.0 is the wire format for both commands and events.
- `type` on a CloudEvent is PascalCase (e.g. `ProposeCounter`); the catalogue `schema` field is kebab-case (e.g. `propose-counter`).
- `dataschema` URI pattern: `{base}/commands/{schema}/{version}` — kebab-case, versioned. Never flat `.json` or PascalCase.
- `POST /commands` returns `201` (accepted and queued); schema validation is synchronous before queuing.
- `source` on the CloudEvent identifies the caller — servers **MUST NOT** use it as the sole routing key; use `type` for routing.
- The `io.oap.agents.*` capability namespace is frozen — renaming is a breaking change.
- `{{OAP_VERSION}}` placeholder everywhere version appears in protocol/spec files; stamped at build time from `version.json`.