# Service Registry — `io.oap.agents.registry`

**Version:** 2025-07-01

The service registry capability provides CRUD operations for managing OAP-compliant services.

## Service Descriptor

A **service descriptor** is the identity card for an OAP-compliant service — what commands it accepts and what events it produces.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Globally unique service identifier |
| `name` | string | yes | Human-readable name |
| `description` | string | no | What this service does |
| `type` | string | no | Service type classification |
| `accepts` | string[] | yes | Command types this service ingests |
| `produces` | string[] | yes | Event types this service publishes |
| `status` | string | yes | One of: `running`, `paused`, `stopped`, `error` |

### Example

```json
{
  "id": "negotiation",
  "name": "Contract Negotiation",
  "description": "Ingests negotiation commands and publishes negotiation events",
  "type": "negotiation-service",
  "accepts": ["ProposeCounter", "AcceptContract", "RejectContract"],
  "produces": ["CounterProposed", "ContractAccepted", "ContractRejected"],
  "status": "running"
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/services` | List all registered services |
| GET | `/services/{id}` | Get service detail |
| POST | `/services` | Register a new service |
| DELETE | `/services/{id}` | Remove a service |

### POST /services

Request body is a service descriptor without `status` (defaults to `stopped`).

Response: `201 Created` with the created service descriptor.

### DELETE /services/{id}

Response: `204 No Content`.

## Schema

See [registry.json](../../protocol/v1/schemas/agents/registry.json).
