# Commands — `io.best.agents.commands`

Commands are **intents to change** a domain service. They are sent **to** the service by any caller — a Process Manager, an AI agent, a UI, or another service. The service validates, queues, and processes them asynchronously.

> Normative reference: [SPEC.md — Commands](https://github.com/behavioralstate/spec/blob/main/SPEC.md#commands--iobestagentscommands). Canonical schema: [commands.json](../../protocol/v1/schemas/agents/commands.json); envelope: [cloudEvent.json](../../protocol/v1/schemas/cloudEvent.json).

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Caller</div>
    <div class="BEST-node-box">Any Caller</div>
    <div class="BEST-node-sub">app · agent · LLM</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">POST /commands</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">BEST Endpoint</div>
    <div class="BEST-node-box accent">Validates &amp; Queues</div>
    <div class="BEST-node-sub">201 Accepted (async)</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">Async processing</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Service</div>
    <div class="BEST-node-box">Domain Handler</div>
    <div class="BEST-node-sub">processes · emits event</div>
  </div>
</div>

> **`POST /commands` is a behaviour endpoint, not a resource collection.** Sending a command is not creating a "command resource" — it is expressing an intent. `/commands` is a single entry point for every operation the service accepts; what happens is determined entirely by the envelope `type`, not the HTTP verb or the URL. In REST you manipulate resources; in BEST you invoke named operations and observe the facts they produce.

Commands ride the [CloudEvents 1.0 envelope](/specs/design-decisions#cloudevents-conformance) — see [SPEC.md — Wire Format](https://github.com/behavioralstate/spec/blob/main/SPEC.md#wire-format--the-best-envelope) for the field table and examples.

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | Catalogue of all available command types and their schema URIs |
| POST | `/commands` | Send a command (CloudEvent). Validates, queues, returns `201` |
| GET | `/commands/{schema}/{version}` | JSON Schema document for one command type and version |

### The catalogue (`GET /commands`)

Each entry: `schema` (kebab-case name, the `{schema}` path segment — distinct from the PascalCase envelope `type`), `version`, `dataschema` (resolvable URI, the exact value to put on the command envelope), optional `description`.

```json
{
  "commands": [
    {
      "schema": "propose-counter",
      "version": "1.0",
      "dataschema": "https://api.example.com/commands/propose-counter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    }
  ]
}
```

Individual command types are **domain data, not capabilities** — they never appear as manifest capability entries.

### Ingestion (`POST /commands`)

1. Validate required envelope attributes.
2. Look up the schema **in the server's own catalogue** — the inbound `dataschema` is a *selector, not a location*; servers **MUST NOT** fetch a caller-supplied URI (SSRF — see [Security](/specs/security#command-ingestion-schema-selection)).
3. Validate `data` against that schema. Schema selection, authorisation, and dispatch **MUST** key on the same identifier.
4. Valid → durably queue, return `201` with `{ "id": ..., "correlationId": ... }`. Invalid → `400`.

The envelope `id` is the **idempotency key**: duplicates are rejected within a retention window; same `id` with a different payload → `409`. `type` is the routing key; `source` must never be the sole routing key. `201` (durably recorded, processing will happen) is the target; use `202` only when the implementation cannot durably enqueue before responding.

### Correlation

The **`correlationid`** envelope attribute (a CloudEvents extension, lowercase on the wire) ties a command to everything it causes. The caller **may** set it; when omitted, the server adopts the command's `id`. The `201` response echoes the effective value as `correlationId`, every resulting event **must** carry it, and follow-up commands in the same process **should** propagate it. Retrieve results with `GET /events?correlationId=...` (history) and `GET /events/stream?correlationId=...` (push). See [Design Decisions — Command Result Retrieval](/specs/design-decisions#command-result-retrieval).

### Schema documents (`GET /commands/{schema}/{version}`)

Returns the raw JSON Schema for one command version — the canonical target of the catalogue's `dataschema` URI. `404` for unknown name or version.

The document **may** declare `produces`: an array of PascalCase event types the command can raise, e.g. `["CounterProposed", "NegotiationFailed"]`. Failure outcomes are ordinary events in that list; the naming convention (`*Failed`) is service-defined. Silent failures are handled client-side via timeout — services should document expected processing times and always publish a failure event rather than silently dropping a command.

When the service publishes [workflows](workflows.md), the document **should** also carry the operation's `workflows` cross-link array — the same ids the catalogue entry carries (see [Workflows — Discoverability](workflows.md#discoverability-one-mechanism-the-workflows-cross-link)).
