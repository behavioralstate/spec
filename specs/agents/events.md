# Events — `io.oap.agents.events`

Domain events are **immutable facts** published by an OAP-compliant service as the result of processing a command. They are the **output** of the service. Callers (Process Managers, synchronisers, other services) subscribe to events to react and keep read models up to date.

## Event Wire Format

Events use the **CloudEvent 1.0 specification** as wire format.

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string | yes | String identifying the service that published this event. A URI is recommended for interoperability but any string is valid. |
| `type` | string | yes | Event type identifier (e.g. `CounterProposed`, `OrderSubmitted`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | **no** | URI to the JSON Schema for `data` — present for typed events, omitted for untyped |
| `time` | string (ISO 8601) | yes | When the event was published |
| `data` | object | yes | The event payload — semantically opaque to the protocol |

Events are:
- **Immutable** — once published, they cannot be changed
- **Published by the service** — they are the result of processing a command
- **Semantically opaque** — the protocol does not interpret `data`

> **Note:** `dataschema` is required for **commands** (the server must validate the payload before queuing) but optional for **events** (the consumer is responsible for interpreting the data when no schema is declared).

## Typed vs Untyped Events

OAP supports two event patterns. Services choose per event type; both can coexist in the same service.

### Typed event — `dataschema` present

The service declares a JSON Schema for the `data` payload. Consumers can fetch the schema, validate payloads, and generate models. This is the preferred pattern when the event shape is stable and well-defined.

```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/events/counter-proposed/1.0",
  "time": "2025-07-01T10:30:01Z",
  "data": {
    "salary": 100000,
    "startDate": "2025-09-01",
    "contractId": "contract-42"
  }
}
```

### Untyped event — `dataschema` absent

The service publishes events without a formal schema. The CloudEvent envelope (`type`, `source`, `id`, `time`) is still present — consumers can route and correlate events. The consumer takes responsibility for interpreting `data`.

This pattern suits services that emit dynamic, loosely-structured payloads (e.g. sensor readings, log streams, forwarded third-party events) where defining a rigid schema would be impractical.

```json
{
  "specversion": "1.0",
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "source": "https://api.example.com/warehouse-sensor",
  "type": "TemperatureRead",
  "datacontenttype": "application/json",
  "time": "2025-07-01T10:30:05Z",
  "data": {
    "celsius": 4.2,
    "sensorId": "fridge-01"
  }
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/events` | List domain events published by this service (optional `?type=` filter) |
| GET | `/events?correlationId={id}` | List events matching a correlation identifier |
| GET | `/events/{schema}/{version}` | Return the JSON Schema document for a specific event type and version |
| POST | `/events` | Inject a domain event — for testing and simulation only (optional capability) |
| POST | `/subscriptions` | Register a webhook for push event delivery (optional) |
| DELETE | `/subscriptions/{id}` | Remove a webhook subscription |

### GET /events

Returns the log of domain events published by this service as results of command processing.

Response: `200 OK` with an `eventList` body.

**Filters:**

- `?type=` — filter by event type (existing)
- `?correlationId={id}` — filter by correlation identifier (the `id` returned by `POST /commands`). Returns the event(s) correlated to a specific command submission. Services that support this filter should declare it in the capability descriptor endpoints list.

### GET /events/{schema}/{version} — Versioned Event Schema Document

Returns the raw JSON Schema document (`application/schema+json`) for a specific event type and version. Mirrors `GET /commands/{schema}/{version}` exactly.

**Path parameters:**
- `schema` — event schema name in kebab-case (e.g. `counter-proposed`)
- `version` — version string (e.g. `1.0`)

Returns `404` if not found.

### POST /events (optional)

Allows injecting a domain event directly into the published event feed. Intended for testing and simulation only.

> **Security:** `POST /events` **MUST** be disabled by default and **MUST NOT** be enabled in production without explicit operator configuration. If implemented, it **MUST** require a distinct administrative scope — general client credentials are not sufficient. Injected events **SHOULD** be marked as synthetic and isolatable from production streams. See [Security Considerations](/docs/security#event-injection-post-events).

Implementations that do not support this **must** declare the `events` capability with `status: "partial"` in the manifest.

Response: `202 Accepted`.

## Event Catalogue

`GET /events` may also serve as an **event catalogue** — returning a list of all event types this service can produce. When used as a catalogue, each entry follows the same structure as a command catalogue entry:

```json
{
  "events": [
    {
      "schema": "counter-proposed",
      "version": "1.0",
      "dataschema": "https://api.example.com/events/counter-proposed/1.0",
      "description": "A counter-offer was proposed in a contract negotiation"
    },
    {
      "schema": "temperature-read",
      "version": "1.0",
      "description": "A temperature reading from a sensor. No formal schema — data shape varies by sensor model."
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | string | yes | Event schema name in kebab-case. Used as the `{schema}` path segment in `GET /events/{schema}/{version}`. |
| `version` | string | yes | Schema version string (e.g. `1.0`). |
| `dataschema` | string (URI) | no | Resolvable URI to the JSON Schema for this event's `data` payload. Omitted for untyped events. |
| `description` | string | no | Human-readable summary of what the event means. For untyped events, this is the primary documentation. |

## Push Notification Channels

Polling `GET /events` is a fallback. OAP defines push channels per transport binding so callers receive events as they are produced.

### MCP — Server-to-Client Notifications

When a caller maintains an active MCP session, the server **may** push domain events to the caller using MCP's server-to-client notification mechanism. Events are pushed as MCP notifications matched by the correlation identifier of a previously submitted command.

To signal that an MCP endpoint supports push event delivery, add `"push": true` to the `mcp` block in the service definition:

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "push": true
}
```

When `"push": true` is present, callers should prefer this channel over polling.

### A2A — Agent-to-Agent Event Delivery

When a caller is connected via A2A, domain events produced by the service are delivered as A2A Messages to the caller agent. The A2A task associated with a command submission receives the resulting event(s) as message artifacts. This is the natural push mechanism for A2A-connected agents.

### Webhook — REST HTTP Clients (optional)

For callers using the REST binding, a webhook callback URL can be registered to receive events as they are produced:

**POST /subscriptions** request:

```json
{
  "serviceId": "invoice-comparison-agent",
  "webhook": {
    "url": "https://my-agent.example.com/oap/events",
    "secret": "hmac-signing-secret"
  },
  "filter": {
    "types": ["CounterProposed", "ContractAccepted"]
  }
}
```

The `secret` field is write-only — never returned in read responses. When present, the server signs delivery payloads using HMAC. The `filter.types` array limits delivery to specific event types; omit it to receive all events. Both `filter.types` entries and the `accepts`/`produces` fields on service descriptors use CloudEvent `type` strings — PascalCase (e.g. `CounterProposed`).

The optional `serviceId` field links this subscription to a registered service. When the service is removed via `DELETE /services/{id}`, all subscriptions with that `serviceId` are automatically deleted — no orphaned webhooks remain. Omit `serviceId` for standalone subscriptions that are not tied to a specific registered service.

Response: `201 Created` with the subscription descriptor (`secret` omitted, plus a generated `id`).

**DELETE /subscriptions/{id}** — Remove a subscription. Returns `204 No Content`.

> **Security:** Servers MUST validate `webhook.url` before storing it. URLs resolving to loopback, link-local, private (RFC 1918), or internal addresses MUST be rejected. Delivery MUST NOT follow HTTP redirects without re-validating the redirect target. The resolved IP MUST be re-validated at delivery time to prevent DNS rebinding. See [Security Considerations](/docs/security#webhook-ssrf-protection).

## Mapping Domain Records to OAP Events

Many implementations do not have a native OAP event store — they have domain-specific records (audit entries, trade history, sensor readings, etc.). Implementers may map these to the OAP event shape at query time.

The protocol only requires that the response conforms to the events schema — it does not prescribe how events are stored internally.

## Schema

See [events.json](../../protocol/v1/schemas/agents/events.json).
