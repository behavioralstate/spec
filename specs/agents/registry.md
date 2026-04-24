# Service Registry — `io.oap.agents.registry`

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
| `webhook` | object | no | Callback configuration for push event delivery over REST — see below |

### `webhook` Object

When present, the server POSTs events matching the caller's `accepts` list to the registered URL using the CloudEvents HTTP binding.

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string (URI) | yes | HTTPS endpoint to receive events as CloudEvents |
| `secret` | string | no | HMAC secret for payload signing. **Write-only** — accepted on `POST /services`, never returned in read responses. |

> **Note:** `secret` is marked `writeOnly: true` in the JSON Schema. Servers must not include it in `GET /services` or `GET /services/{id}` responses. OpenAPI tooling and validators understand this annotation and will suppress the field in generated docs and response models.

> **Security:** Servers MUST validate `webhook.url` before storing it. URLs resolving to loopback, link-local, private (RFC 1918), or internal addresses MUST be rejected. Delivery MUST NOT follow HTTP redirects without re-validating the redirect target. The resolved IP MUST be re-validated at delivery time to prevent DNS rebinding. See [Security Considerations](/docs/security#webhook-ssrf-protection).

### Examples

**POST /services — registration request (secret accepted):**

```json
{
  "id": "negotiation",
  "name": "Contract Negotiation",
  "accepts": ["ProposeCounter", "AcceptContract"],
  "produces": ["CounterProposed", "ContractAccepted"],
  "webhook": {
    "url": "https://my-agent.example.com/oap/events",
    "secret": "hmac-signing-secret"
  }
}
```

**GET /services/{id} — read response (secret omitted):**

```json
{
  "id": "negotiation",
  "name": "Contract Negotiation",
  "accepts": ["ProposeCounter", "AcceptContract"],
  "produces": ["CounterProposed", "ContractAccepted"],
  "status": "running",
  "webhook": {
    "url": "https://my-agent.example.com/oap/events"
  }
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
