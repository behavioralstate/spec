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

Each entry: `schema` (kebab-case name, the `{schema}` path segment — distinct from the PascalCase envelope `type`), optional `commandType` (the exact envelope `type` to send — servers **should** state it, since deriving it from `schema` is a guess; carried identically as a top-level member of the schema document), `version`, `dataschema` (resolvable URI, the exact value to put on the command envelope), optional `description`, optional `workflows` (recipe cross-links), optional `impact` (high-impact annotation — see below).

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

The body is one BEST envelope in the CloudEvents *structured* content mode. Servers accept `Content-Type: application/cloudevents+json` (required from 0.10.0) and, for compatibility, `application/json`; consumers **should** send the former.

1. Validate required envelope attributes.
2. Look up the schema **in the server's own catalogue** — the inbound `dataschema` is a *selector, not a location*; servers **MUST NOT** fetch a caller-supplied URI (SSRF — see [Security](/specs/security#command-ingestion-schema-selection)).
3. Validate `data` against that schema. Schema selection, authorisation, and dispatch **MUST** key on the same identifier.
4. Check the command against the service's current state: a well-formed command it cannot honour (no capacity could ever hold it, nothing by the name it gives) is refused with `400` and a code that names the condition, its `id` left free for the corrected retry. Capacity that is only busy now lets the command wait ([SPEC.md — Commands That Wait](https://github.com/behavioralstate/spec/blob/main/SPEC.md#commands-that-wait)); a command that does not ask to wait is refused here, and a refusal for a state that will pass by itself should say when, as `until` (RFC 3339) in its `details`, with the `reason` where one was given, and the field that asks to wait where the service can hold the command.
5. Valid → durably queue, return `201` with `{ "id": ..., "correlationId": ... }`. Invalid → `400`.

The envelope `id` is the **idempotency key**, scoped to the credential that sent it, within a retention window the service states: a duplicate is rejected (`409`) or safely ignored and answered as the original was, with its status, `id` and `correlationId`; same `id` with a different payload → `409`. `type` is the routing key; `source` is always the caller's declared origin and never a routing key — a service that routes internally by something else maps it behind its edge and requires nothing of that dialect from the caller. `201` (durably recorded, processing will happen) is the target; use `202` only when the implementation cannot durably enqueue before responding. A durably recorded command is processed after a restart, through the same state check, or ends in its failure event; it is never dropped silently. Normative text: [SPEC.md — Ingestion Semantics](https://github.com/behavioralstate/spec/blob/main/SPEC.md#ingestion-semantics).

### Correlation

The **`correlationid`** envelope attribute (a CloudEvents extension, lowercase on the wire) ties a command to everything it causes. The caller **may** set it; when omitted, the server adopts the command's `id`. The `201` response echoes the effective value as `correlationId`, every resulting event **must** carry it, and so does every later fact about what the command created, for as long as it lives; follow-up commands in the same process, from the same sender, **should** propagate it. A correlation id belongs to the credential whose accepted command first used it, and another sender's command naming it is refused ([SPEC.md — Command Results and Correlation](https://github.com/behavioralstate/spec/blob/main/SPEC.md#command-results-and-correlation)). Retrieve results with `GET /events?correlationId=...` (history) and `GET /events/stream?correlationId=...` (push). See [Design Decisions — Command Result Retrieval](/specs/design-decisions#command-result-retrieval).

### Schema documents (`GET /commands/{schema}/{version}`)

Returns the raw JSON Schema for one command version — the canonical target of the catalogue's `dataschema` URI. `404` for unknown name or version.

The document **may** declare `produces`: an array of PascalCase event types the command can raise, e.g. `["CounterProposed", "NegotiationFailed"]`. Failure outcomes are ordinary events in that list; the naming convention (`*Failed`) is service-defined. The document **should** also declare `completes`, the events of `produces` after which the outcome is known, a failure as much as a success; a consumer waits for one of these. Services should document expected processing times and always publish a failure event rather than silently dropping a command ([SPEC.md — Command Results and Correlation](https://github.com/behavioralstate/spec/blob/main/SPEC.md#command-results-and-correlation)).

When the service publishes [workflows](workflows.md), the document **should** also carry the operation's `workflows` cross-link array — the same ids the catalogue entry carries (see [Workflows — Discoverability](workflows.md#discoverability-one-mechanism-the-workflows-cross-link)).

### High-impact annotations (`impact`)

A command the person would want to be asked about first — it moves money, destroys data, cannot be undone, commits the person to something, or lets someone new into what is theirs — **may** carry an `impact` annotation — on its catalogue entry and, identically, as a top-level member of its schema document:

```json
"impact": {
  "categories": ["financial"],
  "confirmation": "required",
  "warning": "Places a real order on your broker account. Capital is at risk."
}
```

`categories` names the kind of impact (`financial`, `destructive`, `irreversible`, `compliance`, `commitment` — binds the person: opens an account, accepts terms — and `access` — grants a principal access to what is theirs: issues a credential, shares a resource; open vocabulary; unknown values are treated as high-impact). `confirmation: "required"` means a consumer acting on behalf of a human **must not** submit the command without explicit, per-submission confirmation from that human; `"recommended"` allows proceeding under a durable prior authorization. `warning` is text the consumer **should** surface, substantially intact, before asking.

The annotation is the *discovery half* of the [high-impact controls in Security](/specs/security#high-impact-commands): it tells well-behaved consumers what to do, and never replaces the server-side control — a server cannot rely on clients honoring it. Normative reference: [SPEC.md — Impact Annotations](https://github.com/behavioralstate/spec/blob/main/SPEC.md#impact-annotations).
