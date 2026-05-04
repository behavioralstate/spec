# Service Memory — `io.oap.agents.memory`

The memory capability exposes service memory state. The `{id}` parameter is the service identifier as declared in the discovery manifest (`services[].id`). The response body is **opaque** — the protocol does not prescribe its structure. Different runtimes return different formats.

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/services/{id}/memory` | Get current memory state for a service |

The web UI renders memory as raw JSON.

## Schema

See [memory.json](../../protocol/v1/schemas/agents/memory.json).
