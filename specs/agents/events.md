# Event Delivery — `io.oap.agents.events`

**Version:** 2025-07-01

Events are immutable observed facts. They are the **input** to agents.

## Event Shape

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | Event type identifier |
| `data` | object | yes | The event payload (domain-specific) |
| `metadata` | object (string→string) | yes | Key-value metadata |

Events are:
- **Immutable** — once produced, they cannot be changed
- **Externally produced** — agents receive events, they don't create them
- **Semantically opaque** — the protocol does not interpret `data`

### Example

```json
{
  "type": "ContractProposed",
  "data": { "salary": 95000, "startDate": "2025-09-01", "benefits": ["health", "dental"] },
  "metadata": { "correlationId": "abc-123", "source": "hr-system", "timestamp": "2025-07-01T10:30:00Z" }
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| POST | `/events` | Send an event to the runtime |
| GET | `/events` | List recent events (optional `?type=` filter) |

### POST /events

Response: `202 Accepted` — the runtime routes the event to matching agents asynchronously.

## Mapping Domain Records to OAP Events

Many implementations do not have a native OAP event store — they have domain-specific records (signals, logs, audit entries, trade history, sensor readings, etc.). Implementers may map these to the OAP event shape at query time.

For example, a signal history table can satisfy `GET /events` by projecting each row to the `{ type, data, metadata }` shape when the endpoint is called. The protocol only requires that the response conforms to the events schema — it does not prescribe how events are stored internally.

For `POST /events`, if no live event store exists, implementers may declare the `events` capability with `status: "partial"` and document which operations are supported in their `rest.openapi` spec.

## Schema

See [events.json](../../protocol/v1/schemas/agents/events.json).
