# Commands — `io.oap.agents.commands`

**Version:** 2025-07-01

Commands are **intents to change** a domain service. They are sent **to** the service by any caller — a Process Manager, an AI agent, a UI, or another service. The service validates, queues, and processes them asynchronously.

## Command Wire Format

Commands use the **CloudEvent 1.0 specification** as wire format. The `data` property is validated by the ingestion API against the JSON Schema at the `dataschema` URI before the command is queued.

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string (URI) | yes | URI identifying the sender |
| `type` | string | yes | Command type identifier (e.g. `ProposeCounter`, `SubmitOrder`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` — hosted by the ingestion API |
| `time` | string (ISO 8601) | yes | When the command was created |
| `data` | object | yes | The command payload — validated against `dataschema` |

### Schema Authority

The ingestion API owns and hosts the schemas. The `dataschema` URI may point to a blob storage location, a mounted volume path, or any remotely accessible file — as long as it is resolvable by the API at validation time.

### Example

```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/commands/ProposeCounter.json",
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
| GET | `/commands` | Return the catalogue of available command types and their schema URIs |
| POST | `/commands` | Send a command (CloudEvent). Validates, queues, returns `201`. |

### GET /commands — Command Catalogue

Returns the list of command types this service accepts, each with its `dataschema` URI. This is the primary discovery surface: callers call this to learn what they can send and how to construct the payload.

```json
{
  "commands": [
    {
      "type": "ProposeCounter",
      "dataschema": "https://api.example.com/schemas/commands/ProposeCounter.json",
      "description": "Propose a counter-offer in a contract negotiation"
    },
    {
      "type": "AcceptContract",
      "dataschema": "https://api.example.com/schemas/commands/AcceptContract.json",
      "description": "Accept the current contract terms"
    }
  ]
}
```

### POST /commands — Command Ingestion

Single entry point for all commands. The `type` field on the CloudEvent determines what the service does with it.

Processing steps:
1. Validate required CloudEvent attributes are present
2. Dereference `dataschema` URI and validate `data` against the schema
3. If valid: queue the command and return `201`
4. If invalid: return `400` with error detail

Response: `201 Created` — the command has been accepted and queued.

## Schema

See [commands.json](../../protocol/v1/schemas/agents/commands.json).
