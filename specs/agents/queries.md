# Queries — `io.best.agents.queries`

**From SPEC.md:** [Queries](https://github.com/behavioralstate/spec/blob/main/SPEC.md#queries--iobestagentsqueries)

## Queries beside the other capabilities

Unlike commands (queued, results observed afterwards), a query returns its result directly in the HTTP response body and changes nothing.

| Capability | HTTP | Returns | Changes state? |
|---|---|---|---|
| `agents.commands` | `POST /commands` | `201` (async) | **Yes** |
| `agents.events` | `GET /events` | Event history | No |
| `agents.queries` | `GET /queries/{schema}` | Current state (sync) | **No** |

Queries are not a replacement for OpenAPI either: BEST queries are a single, fixed GET pattern with catalogue-driven discovery, and the two can coexist.
