# Events — `io.best.agents.events`

Domain events are **immutable facts** published by a BEST-compliant service as the result of processing. They are the **output** of the service: callers observe them to retrieve command results, react, and keep read models up to date.

> Normative reference: [SPEC.md — Events](https://github.com/behavioralstate/spec/blob/main/SPEC.md#events--iobestagentsevents). Canonical schema: [events.json](../../protocol/v1/schemas/agents/events.json); envelope: [cloudEvent.json](../../protocol/v1/schemas/cloudEvent.json).

Events ride the same CloudEvents 1.0 envelope as commands. Two event-specific rules:

- **`correlationid`** (CloudEvents extension attribute, lowercase on the wire) is **required** on every event produced by processing a command — set to that command's correlation identifier (the `correlationId` echoed by `POST /commands`). Spontaneous events may omit it. This is what lets any consumer, including one that never saw the command, match events to their originating submission.
- **`dataschema` is optional.** With it, the event is **typed** — consumers fetch the schema and validate. Without it, the event is **untyped** — the consumer interprets `data`; the envelope (`type`, `source`, `id`, `correlationid`, `time`) still supports routing and correlation. Both patterns can coexist in one service; untyped suits dynamic payloads (sensor readings, log streams, forwarded third-party events).

```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/events/counter-proposed/1.0",
  "correlationid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "time": "2025-07-01T10:30:01Z",
  "data": { "salary": 100000, "startDate": "2025-09-01", "contractId": "contract-42" }
}
```

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/events` | **Historical query** — paginated log of past events, filterable by type, source, time range, correlation ID |
| GET | `/events/stream` | **Live stream** — SSE; delivers events produced *after* the connection is opened |
| GET | `/events/{schema}/{version}` | JSON Schema document for one event type and version (mirrors `GET /commands/{schema}/{version}`; `404` if unknown) |

> **`GET /events` and `GET /events/stream` are complementary, not alternatives.** History first, then open the stream:
>
> ```
> GET /events?correlationId=abc123        → what has already happened
> GET /events/stream?correlationId=abc123 → what happens next
> ```

> **No replay guarantee.** `GET /events` returns whatever the server currently exposes — a full log, a recent window, or a mapped view of domain records. Clients cannot assume completeness, ordering, or replay fidelity. For reliable point-in-time delivery, use a push channel.

### Query parameters (`GET /events`)

| Parameter | Description |
|---|---|
| `type` | Filter by envelope `type` (PascalCase), across all interactions |
| `correlationId` | Only events whose `correlationid` envelope attribute matches |
| `source` | Filter by publishing service |
| `from` / `to` | ISO 8601 time-range bounds (inclusive) |
| `limit` | Max results; servers may apply a lower ceiling |
| `after` | Opaque pagination cursor — pass the previous response's `nextCursor`, preserving all other parameters; absent `nextCursor` means last page |

### SSE stream (`GET /events/stream`)

Request with `Accept: text/event-stream` plus credentials; optional filters `correlationId`, `type`, `source`. Each event arrives as an SSE `data` field with the envelope JSON; the envelope `id` is echoed as the SSE event `id`. On reconnect, clients send `Last-Event-ID` and the server replays anything produced after it. Servers **should** send `: keepalive` comments and **may** close after inactivity or a terminal event; clients **must** handle reconnection — the stream is not lossless.

### Event catalogue

`GET /events` may also serve catalogue entries mirroring the command catalogue: `schema` (kebab-case), `version`, optional `dataschema` (omitted for untyped events), `description` — the primary documentation for untyped events.

## Push channels

Polling is the universal fallback. The events capability declares its push channels in the manifest's `push` block:

```json
"push": { "sse": true, "mcp": true }
```

| Caller | Channel |
|---|---|
| Browser app, CLI, local agent | **SSE** — no public endpoint required |
| LLM client with an active MCP session | **MCP push** — server-to-client notifications, matched by correlation identifier; declared with `"push": true` on the `mcp` block |
| Anything else | **Polling** `GET /events` — always available |

## Mapping domain records to BEST events

Implementations without a native event store may map domain records (audit entries, trade history, sensor readings) to the BEST event shape at query time. The protocol only requires that responses conform to the events schema — it never prescribes internal storage.
