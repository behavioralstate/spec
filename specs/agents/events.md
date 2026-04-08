# Events — `io.oap.agents.events`

**Version:** 2025-07-01

Domain events are **immutable facts** published by an OAP-compliant service as the result of processing a command. They are the **output** of the service. Callers (Process Managers, synchronisers, other services) subscribe to events to react and keep read models up to date.

## Event Wire Format

Events use the **CloudEvent 1.0 specification** as wire format.

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string (URI) | yes | URI identifying the service that published this event |
| `type` | string | yes | Event type identifier (e.g. `CounterProposed`, `OrderSubmitted`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` |
| `time` | string (ISO 8601) | yes | When the event was published |
| `data` | object | yes | The event payload — semantically opaque to the protocol |

Events are:
- **Immutable** — once published, they cannot be changed
- **Published by the service** — they are the result of processing a command
- **Semantically opaque** — the protocol does not interpret `data`

### Example

```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/events/CounterProposed.json",
  "time": "2025-07-01T10:30:01Z",
  "data": {
    "salary": 100000,
    "startDate": "2025-09-01",
    "contractId": "contract-42"
  }
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/events` | List domain events published by this service (optional `?type=` filter) |
| POST | `/events` | Inject a domain event — for testing and simulation only (optional capability) |

### GET /events

Returns the log of domain events published by this service as results of command processing.

Response: `200 OK` with an `eventList` body.

### POST /events (optional)

Allows injecting a domain event directly into the event log. Intended for testing and simulation only. Implementations that do not support this **must** declare the `events` capability with `status: "partial"` in the manifest.

Response: `202 Accepted`.

## Mapping Domain Records to OAP Events

Many implementations do not have a native OAP event store — they have domain-specific records (audit entries, trade history, sensor readings, etc.). Implementers may map these to the OAP event shape at query time.

The protocol only requires that the response conforms to the events schema — it does not prescribe how events are stored internally.

## Schema

See [events.json](../../protocol/v1/schemas/agents/events.json).
