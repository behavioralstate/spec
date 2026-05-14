# Service Lifecycle — `io.bsp.agents.lifecycle`

The lifecycle capability adds operational controls on a named service. The `{id}` parameter is the service identifier as declared in the discovery manifest (`services[].id`).

## HTTP API

| Method | Path | Description |
|---|---|---|
| POST | `/services/{id}/pause` | Pause a running service |
| POST | `/services/{id}/resume` | Resume a paused service |
| POST | `/services/{id}/heartbeat` | Signal that a service is still alive |

All return `204 No Content` on success.

## Heartbeat

Agents **should** call `POST /services/{id}/heartbeat` periodically to confirm they are still running. This prevents stale entries accumulating in the registry — if no heartbeat is received within the server-defined window, the server **should** transition the service `status` to `"error"`.

The heartbeat interval is server-defined and should be documented by each implementation. A reasonable default is 60 seconds; agents should call more frequently than the window (e.g. every 30 seconds when the window is 60 seconds).

If an agent process crashes without a clean `DELETE /services/{id}`, the heartbeat mechanism ensures the registry self-corrects over time rather than accumulating ghost entries indefinitely.

## Schema

See [lifecycle.json](../../protocol/v1/schemas/agents/lifecycle.json).
