# Queries — `io.best.agents.queries`

Queries are **synchronous reads** of current domain state — the read-before-write complement to commands. Unlike commands (queued, results observed via events), a query returns its result directly in the HTTP response body and changes nothing. Optional capability, declared in the manifest like any other.

> Normative reference: [SPEC.md — Queries](https://github.com/behavioralstate/spec/blob/main/SPEC.md#queries--iobestagentsqueries). Canonical schema: [queries.json](../../protocol/v1/schemas/agents/queries.json).

The canonical use: an AI agent needs to know which broker accounts exist before it can reference one in a command.

| Capability | HTTP | Returns | Changes state? |
|---|---|---|---|
| `agents.commands` | `POST /commands` | `201` (async) | **Yes** |
| `agents.events` | `GET /events` | Event history | No |
| `agents.queries` | `GET /queries/{schema}` | Current state (sync) | **No** |

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/queries` | Catalogue of all available query types |
| GET | `/queries/{schema}/{version}` | JSON Schema document for one query type and version |
| GET | `/queries/{schema}` | Execute the query; parameters as query string |

**Catalogue** (`GET /queries`) — same structure as the command catalogue: `schema` (kebab-case), `version`, `dataschema` (URI resolving to the schema document), optional `description`.

**Schema document** (`GET /queries/{schema}/{version}`) — three sections: optional `description`, optional `parameters` (JSON Schema for accepted query-string parameters), required `response` (JSON Schema for the response body). `404` for unknown name or version.

**Execution** (`GET /queries/{schema}`) — `200` with a body matching the `response` schema; `400` for missing/invalid parameters; `404` for an unknown schema name.

## Usage pattern

```
GET /queries                          → discover available queries
GET /queries/list-brokers/1.0         → learn input params and response shape
GET /queries/list-brokers             → execute and get broker list
POST /commands                        → now you have the BrokerId you need
```

## What queries are NOT

- **Not a REST resource hierarchy** — no sub-resources, nested paths, or per-item GETs; each query is a named, flat operation.
- **Not a query language** — no filter expressions, joins, or aggregations beyond simple parameters.
- **Not event sourcing** — queries return current state as the service projects it; the source of truth for historical facts remains `GET /events`.
- **Not a replacement for OpenAPI** — BEST queries are a single, fixed GET pattern with catalogue-driven discovery; the two can coexist.
