# Events — `io.best.agents.events`

Events ride the same CloudEvents 1.0 envelope as commands ([cloudEvent.json](../../protocol/v1/schemas/cloudEvent.json)) — see [SPEC.md — Wire Format](https://github.com/behavioralstate/spec/blob/main/SPEC.md#wire-format--the-best-envelope) for the field table and an example.

**From SPEC.md:** [Events](https://github.com/behavioralstate/spec/blob/main/SPEC.md#events--iobestagentsevents)

## Reading the log and the stream

When paging through `GET /events` with `after`, keep all other parameters as they were. The stream is not lossless, which is why clients handle reconnection.

Untyped events suit dynamic payloads: sensor readings, log streams, forwarded third-party events.

SSE needs no public endpoint on the caller's side. MCP push is server-to-client notifications, matched by correlation identifier.

## Mapping domain records to BEST events

Implementations without a native event store may map domain records (audit entries, trade history, sensor readings) to the BEST event shape at query time. The protocol only requires that responses conform to the events schema — it never prescribes internal storage.
