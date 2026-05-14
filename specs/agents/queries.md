# Queries — `io.bsp.agents.queries`

Queries are **synchronous reads** of current domain state. They return data directly without changing anything. Unlike commands (which are queued and produce events asynchronously), queries return their result in the HTTP response body.

## Design Rationale

BSP's command/event model is write-side only: commands change state, events record what happened. This is intentional — it decouples the write path from the read path and allows asynchronous processing. However, many callers need to read current state before they can issue commands. For example, an AI agent needs to know which broker accounts exist before it can reference one in a `configure-indicator-alert` command.

Queries fill this gap:

| Capability | HTTP | Returns | Changes state? |
|---|---|---|---|
| `agents.commands` | `POST /commands` | `201 Accepted` (async) | **Yes** |
| `agents.events` | `GET /events` | Event history | No |
| `agents.queries` | `GET /queries/{schema}` | Current state (sync) | **No** |

Queries are **not** a replacement for OpenAPI or a general REST query language. They are a minimal, catalogue-driven read surface that follows exactly the same discovery pattern as commands — discoverable, schema-described, and consistent.

<div class="BSP-diagram">
  <div class="BSP-node">
    <div class="BSP-node-title">Caller</div>
    <div class="BSP-node-box">Any Caller</div>
    <div class="BSP-node-sub">app · agent · LLM</div>
  </div>
  <div class="BSP-arrow">
    <div class="BSP-arrow-label">GET /queries/{schema}</div>
    <div class="BSP-arrow-track">→</div>
  </div>
  <div class="BSP-node">
    <div class="BSP-node-title">BSP Endpoint</div>
    <div class="BSP-node-box accent">Query Handler</div>
    <div class="BSP-node-sub">reads current state</div>
  </div>
  <div class="BSP-arrow">
    <div class="BSP-arrow-label">Sync response</div>
    <div class="BSP-arrow-track">→</div>
  </div>
  <div class="BSP-node">
    <div class="BSP-node-title">Result</div>
    <div class="BSP-node-box">Current State</div>
    <div class="BSP-node-sub">JSON in HTTP body</div>
  </div>
</div>

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/queries` | Return the catalogue of all available query types |
| GET | `/queries/{schema}/{version}` | Return the JSON Schema document for a specific query type and version |
| GET | `/queries/{schema}` | Execute the query. Parameters passed as query string. |

### GET /queries — Query Catalogue

Returns the list of query types this service supports. Same structure as the command catalogue.

Each catalogue entry has four fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | string | yes | Query schema name in kebab-case (e.g. `list-brokers`). Used as the `{schema}` path segment. |
| `version` | string | yes | Latest version string (e.g. `1.0`). |
| `dataschema` | string (URI) | yes | Resolvable URI to the JSON Schema document at `GET /queries/{schema}/{version}`. |
| `description` | string | no | Human-readable summary of what the query returns. |

```json
{
  "queries": [
    {
      "schema": "list-brokers",
      "version": "1.0",
      "dataschema": "https://api.example.com/queries/list-brokers/1.0",
      "description": "List all configured broker accounts for this tenant."
    },
    {
      "schema": "list-alerts",
      "version": "1.0",
      "dataschema": "https://api.example.com/queries/list-alerts/1.0",
      "description": "List all configured alerts (indicators and strategies) for this tenant."
    }
  ]
}
```

### GET /queries/{schema}/{version} — Query Schema Document

Returns the JSON Schema document for a specific query. The document has two sections:

| Section | Required | Description |
|---|---|---|
| `description` | no | Human-readable summary |
| `parameters` | no | JSON Schema for accepted query string parameters |
| `response` | yes | JSON Schema for the response body |

**Example — `GET /queries/list-brokers/1.0`:**

```json
{
  "description": "List all configured broker accounts for this tenant.",
  "parameters": {
    "type": "object",
    "properties": {
      "includeStats": {
        "type": "boolean",
        "description": "Include performance statistics for each broker account."
      }
    }
  },
  "response": {
    "type": "object",
    "required": ["brokers"],
    "properties": {
      "brokers": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name"],
          "properties": {
            "id":          { "type": "string", "description": "Broker account identifier (BrokerId)" },
            "name":        { "type": "string", "description": "Broker name (BrokerName, e.g. T212, IBKR)" },
            "displayName": { "type": "string" },
            "configured":  { "type": "boolean" },
            "connected":   { "type": "boolean" }
          }
        }
      }
    }
  }
}
```

Returns `404` if the schema name or version is not found.

### GET /queries/{schema} — Execute Query

Executes the query synchronously. Parameters (if any) are passed as query string key-value pairs matching the `parameters` schema.

Response: `200 OK` with the response body matching the `response` schema.

**Example — `GET /queries/list-brokers?includeStats=false`:**

```json
{
  "brokers": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "T212",
      "displayName": "Trading 212",
      "configured": true,
      "connected": false
    }
  ]
}
```

Returns `404` if the schema name is not supported.

Returns `400` if required parameters are missing or invalid.

## Usage Pattern

```
GET /queries                          → discover available queries
GET /queries/list-brokers/1.0         → learn input params and response shape
GET /queries/list-brokers             → execute and get broker list
POST /commands  (configure-indicator-alert)  → now you have the BrokerId you need
```

This is the canonical flow for an AI agent that needs to read state before issuing a command.

## What Queries Are NOT

- **Not a REST resource hierarchy** — there are no sub-resources, nested paths, or per-item GETs here. Each query is a named, flat operation. Standard REST GET endpoints (e.g. `GET /brokers/{id}`) belong in the service's own API and are out of BSP scope.
- **Not a query language** — no filtering expressions, joins, aggregations, or sort clauses beyond simple parameters.
- **Not event sourcing** — queries return current state as the service projects it, not a replay of events. The source of truth for historical facts remains `GET /events`.
- **Not a replacement for OpenAPI** — OpenAPI describes every HTTP endpoint, parameter, and response exhaustively. BSP Queries defines a single, fixed GET pattern with catalogue-driven discovery. The two can coexist.

## Schema

See [queries.json](../../protocol/v1/schemas/agents/queries.json).
