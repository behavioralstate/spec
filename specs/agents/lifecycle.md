# Service Lifecycle — `io.oap.agents.lifecycle`

**Extends:** `io.oap.agents.registry`

The lifecycle capability adds pause and resume operations to the service registry.

## REST API

| Method | Path | Description |
|---|---|---|
| POST | `/services/{id}/pause` | Pause a running service |
| POST | `/services/{id}/resume` | Resume a paused service |

Both return `204 No Content` on success.

## Schema

See [lifecycle.json](../../protocol/v1/schemas/agents/lifecycle.json).
