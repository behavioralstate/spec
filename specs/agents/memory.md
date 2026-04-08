# Service Memory — `io.oap.agents.memory`

**Version:** 2025-07-01  
**Extends:** `io.oap.agents.registry`

The memory capability exposes service memory state. The response body is **opaque** — the protocol does not prescribe its structure. Different runtimes return different formats.

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/services/{id}/memory` | Get current memory state for a service |

The web UI renders memory as raw JSON.

## Schema

See [memory.json](../../protocol/v1/schemas/agents/memory.json).
