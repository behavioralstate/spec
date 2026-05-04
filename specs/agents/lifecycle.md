# Service Lifecycle — `io.oap.agents.lifecycle`

The lifecycle capability adds pause and resume operations on a named service. The `{id}` parameter is the service identifier as declared in the discovery manifest (`services[].id`).

## REST API

| Method | Path | Description |
|---|---|---|
| POST | `/services/{id}/pause` | Pause a running service |
| POST | `/services/{id}/resume` | Resume a paused service |

Both return `204 No Content` on success.

## Schema

See [lifecycle.json](../../protocol/v1/schemas/agents/lifecycle.json).
