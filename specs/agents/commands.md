# Commands — `io.oap.agents.commands`

Commands are **intents to change** a domain service. They are sent **to** the service by any caller — a Process Manager, an AI agent, a UI, or another service. The service validates, queues, and processes them asynchronously.

## Command Wire Format

Commands use the **CloudEvent 1.0 specification** as wire format. The CloudEvent envelope is the same shape used by both commands and events — see [cloudEvent.json](../../protocol/v1/schemas/cloudEvent.json) for the canonical JSON Schema definition.

The `dataschema` field in an **incoming command** is informational metadata — it documents which schema the client used when constructing the payload. It is **not** an instruction to the server. The server selects the schema to validate against using the `type` field, by looking up that type in its own command catalogue. A well-formed client will have fetched the schema from `GET /commands` and its `dataschema` value will match what the server holds — but the server never needs to fetch it.

> **Note:** A server that fetches the caller-supplied `dataschema` URI to perform validation would be both architecturally wrong (the server owns its schema catalogue) and a security risk (caller-controlled URI fetch is an SSRF vector). See [Security Considerations](/docs/security#command-ingestion-dataschema-validation).

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string | yes | String identifying the origin of the command. A URI is recommended for interoperability (e.g. `https://pm.example.com/negotiation-agent`) but any string is valid — callers may use it as a routing key, a label, or any identifier meaningful to their system. The `source + id` pair serves as a globally unique message identifier. Servers **MUST NOT** use `source` as the sole routing key for backend handlers — use `type` for routing instead. |
| `type` | string | yes | Command type identifier in PascalCase (e.g. `ProposeCounter`, `SubmitOrder`). This is the natural routing key — implementations should use `type` to determine which backend handler, queue, or processor receives the command. |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` — hosted by the ingestion API at `GET /commands/{schema}/{version}` |
| `time` | string (ISO 8601) | yes | When the command was created |
| `data` | object | yes | The command payload — validated against `dataschema` |

### Playground template

When a caller selects `POST /commands` in a playground or tooling UI, the CloudEvent envelope is the template to pre-populate. The fields follow the shape in `cloudEvent.json`. The `data` object should be replaced by an empty object whose structure is discovered by calling `GET /commands/{schema}/{version}` for the chosen command type.

### Schema Authority

The ingestion API owns and hosts the schemas via `GET /commands/{schema}/{version}`. The `dataschema` URI in a command catalogue entry points to this endpoint — same base URL, same capability.

> **Command types are domain data, not protocol capabilities.** Individual command types (`ProposeCounter`, `SubmitOrder`) must not appear as capability entries in `/.well-known/oap`. The capability `io.oap.agents.commands` declares that this service supports the command surface; the specific command types accepted are discovered at runtime via `GET /commands`. Proliferating per-command capabilities would mix domain identifiers into the protocol namespace and make the manifest domain-specific rather than protocol-specific.

### Example

```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/ProposeCounter/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": {
    "salary": 100000,
    "startDate": "2025-09-01"
  }
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | Return the catalogue of all available command types and their schema URIs |
| POST | `/commands` | Send a command (CloudEvent). Validates, queues, returns `201`. |
| GET | `/commands/{schema}/{version}` | Return the JSON Schema document for a specific command type and version |

### GET /commands — Command Catalogue

Returns the list of command types this service accepts. This is the primary discovery surface: callers use it to learn what they can send and how to construct the payload.

Each catalogue entry has four fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | string | yes | Command schema name in kebab-case (e.g. `propose-counter`). Used as the `{schema}` path segment in `GET /commands/{schema}/{version}`. Not the same as the CloudEvent `type` field. |
| `version` | string | yes | Schema version string (e.g. `1.0`). First-class field — callers do not need to parse `dataschema` to determine the version. |
| `dataschema` | string (URI) | yes | Resolvable URI to the JSON Schema for this command's `data` payload. This is the value to place in the `dataschema` field of a CloudEvent command. |
| `description` | string | no | Human-readable summary of what the command does. |

> **`schema` vs CloudEvent `type`:** The catalogue field is named `schema` (not `type`) to avoid ambiguity with the CloudEvent `type` attribute, which consumers already use on the wire. The CloudEvent `type` value (e.g. `ProposeCounter`) is typically the PascalCase form of the `schema` name.

```json
{
  "commands": [
    {
      "schema": "propose-counter",
      "version": "1.0",
      "dataschema": "https://api.example.com/commands/propose-counter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    },
    {
      "schema": "accept-contract",
      "version": "1.0",
      "dataschema": "https://api.example.com/commands/accept-contract/1.0",
      "description": "Accept the current contract terms"
    }
  ]
}
```

### POST /commands — Command Ingestion

Single entry point for all commands. The `type` field on the CloudEvent determines what the service does with it.

Processing steps:
1. Validate required CloudEvent attributes are present
2. Use `type` to look up the schema from the server's own catalogue
3. Validate `data` against the catalogue schema
4. If valid: queue the command and return `201`
5. If invalid: return `400` with error detail

> **Security:** The CloudEvent `id` field **MUST** be treated as an idempotency key. Servers MUST detect and reject duplicate command submissions (same `id` + authenticated source) within a defined retention window. A duplicate with a different payload **MUST** return `409`. See [Security Considerations](/docs/security#command-replay-protection).

Response: `201 Created` — the command has been accepted and queued.

### GET /commands/{schema}/{version} — Versioned Schema Document

Returns the JSON Schema document for a specific command type and version. This is the canonical target for the `dataschema` URI in a command catalogue entry.

**Path parameters:**
- `schema` — schema name in kebab-case, matching the `schema` field of the catalogue entry (e.g. `propose-counter`)
- `version` — version string, matching the `version` field of the catalogue entry (e.g. `1.0`, `2.1`)

Response: a raw JSON Schema document (`application/schema+json`). The URL of this endpoint is the canonical value to put in the `dataschema` field of a command catalogue entry (e.g. `https://api.example.com/commands/propose-counter/1.0`).

Returns `404` if the schema name or version is not found.

#### `produces` — Declared Event Outcomes (optional)

The JSON Schema document returned by this endpoint **may** include a `produces` field declaring the domain events this command can raise. This field is optional — its absence does not indicate non-conformance. When absent, callers may fall back to parsing the human-readable `description` field.

`produces` is an array of PascalCase event type name strings. The schema for each event is self-describing on the CloudEvent envelope (`dataschema` field) when the event arrives, and is also discoverable upfront via the event catalogue (`GET /events`).

**Example:**

```json
"produces": ["CounterProposed", "NegotiationFailed"]
```

#### Failure Events

Failure outcomes are regular domain events in the `produces` list. The naming convention that distinguishes a failure event (e.g. suffix `Failed`, `Failure`) is service-defined — OAP does not mandate a specific suffix. Services must document their convention in the `description` field. Silent failures (no event raised at all) are handled client-side via timeout.

#### Correlation

The `id` returned in the `201 Created` response to `POST /commands` is the **correlation identifier**. Callers use it to match incoming events back to the originating command:

```json
{ "id": "XCSFIFR04763087" }
```

No additional correlation field is defined at the protocol level. The field name used to carry the correlation identifier inside an event payload is agreed between client and server — OAP does not mandate it.

## Schema

See [commands.json](../../protocol/v1/schemas/agents/commands.json).
