# OAP — CQRS + Event Sourcing Refactor Plan

This document captures the authoritative mental model, all decisions made during the design session, and the full file-by-file change plan. Read this before touching any file.

---

## 1. Foundational Mental Model

OAP is grounded in CQRS + Event Sourcing. These definitions are non-negotiable.

### Command
An **intent to change** something in the system. Sent **to** a domain service.
- Examples: `SubmitOrder`, `ProposeCounter`, `BindPolicy`, `EnrollPatient`
- Wire format: **CloudEvent** (specversion, id, source, type, datacontenttype, dataschema, time, data)
- Delivery: **1:1** — goes to a queue, processed by exactly one authority (a Bounded Context)
- The `data` property is validated against the JSON Schema at the `dataschema` URI
- The schema is owned and hosted by the **ingestion API** (can be blob storage, mounted volume, remote file)
- On success the API returns **201 Accepted** and queues the command

### Domain Event
The **result of processing a command** — an immutable fact that something happened.
- Examples: `OrderSubmitted`, `CounterProposed`, `PolicyBound`
- Published **from** the domain service after a command is processed
- Delivery: **1:many** — pub/sub, any number of subscribers
- Subscribers include: synchronisers (keeping read models up to date), Process Managers, external listeners

### Process Manager (PM) / AI Brain
A component that **subscribes to domain events** and **sends commands** back to a domain service.
- Reacts to events from any producer: IoT sensors, logs, domain event stores, external systems
- Applies heuristics, rules, or AI/LLM reasoning
- Produces one or more commands as output
- Is **a caller of the OAP API** — not the thing OAP describes
- The AI Brain pattern from the 2023 article: Brain Unit (logic) + Memory (event-sourced aggregate)

### OAP-Compliant Service
What OAP actually describes: **the domain service's interaction surface**.
- **Accepts** commands (sent in by any caller — PM, UI, another service, a human)
- **Produces** events (results of processing, readable via `GET /events`)
- Has no prescribed internal implementation — can be pure CQRS+ES with no AI at all

### What is behind an OAP service (implementation-agnostic)
Any of these are valid — OAP does not care:
- A traditional CQRS pipeline: command in → queue → processing function → domain event → synchroniser → read model
- An AI agent doing command routing and validation
- A human-in-the-loop workflow
- An IoT sensor pushing readings as events

---

## 2. Purpose of OAP

> OAP makes CQRS + Event Sourcing patterns **discoverable and interoperable** — ready to be consumed by any caller, including AI agents.

The `/.well-known/oap` manifest lives on the **domain service**. It tells any caller:
- What commands this service accepts (with schema URIs for each)
- What events it publishes (observable via `GET /events`)
- How to reach it (REST endpoint, MCP server, A2A card)

---

## 3. Terminology Corrections

These are the changes that must propagate everywhere.

| Old term | New term | Reason |
|---|---|---|
| `agent` (as the OAP-described thing) | `service` | OAP describes a domain service, not necessarily an AI agent |
| `accepts` (event types) | `accepts` (command types) | The service accepts **commands**, not events |
| `produces` (command types) | `produces` (event types) | The service produces **events**, not commands |
| `GET /commands` = log of produced commands | `GET /commands` = **catalogue** of accepted command types + schema URIs | Commands go IN; GET /commands is discovery, not a log |
| `POST /events` = send event to runtime | stays, but meaning clarified: inject a domain event for testing/simulation | Events come OUT; POST /events is a test/simulation hook |
| `GET /events` = list recent events | stays: log of domain events published by the service | Correct direction |

### The "agent" term nuance
The word "agent" is NOT banned — it is repositioned:
- An OAP **service** is what the manifest describes (a domain service with a command ingestion surface)
- An OAP **client** or **caller** can be an AI agent, a PM, a UI, another service
- The spec should not conflate the two

---

## 4. Wire Format: CloudEvent

Commands and Events both use the **CloudEvent 1.0 specification** as wire format. Replace the current custom `{ type, data, metadata }` shape.

### CloudEvent attributes used by OAP

| Attribute | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID) |
| `source` | string (URI) | yes | Who sent this (the PM, the sensor, the UI) |
| `type` | string | yes | Command or event type (e.g. `ProposeCounter`, `ContractProposed`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` — hosted by the ingestion API |
| `time` | string (ISO 8601) | yes | When the message was created |
| `data` | object | yes | The domain payload — validated against `dataschema` |

### Example command (CloudEvent)
```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/ProposeCounter/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": {
    "salary": 100000,
    "startDate": "2025-09-01"
  }
}
```

### Example event (CloudEvent)
```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/events/CounterProposed.json",
  "time": "2025-07-01T10:30:01Z",
  "data": {
    "salary": 100000,
    "startDate": "2025-09-01",
    "contractId": "contract-42"
  }
}
```

---

## 5. REST API Surface (corrected)

### Commands

| Method | Path | Description |
|---|---|---|
| `GET` | `/commands` | **Catalogue**: list all command types this service accepts, each with a versioned `dataschema` URI |
| `POST` | `/commands` | **Ingestion**: send a CloudEvent command. Validates `data` against `dataschema`. Queues and returns `201`. |
| `GET` | `/commands/{schema}/{version}` | **Versioned schema**: the JSON Schema document for one command type + version |

#### GET /commands response shape
```json
{
  "commands": [
    {
      "type": "ProposeCounter",
      "dataschema": "https://api.example.com/schemas/ProposeCounter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    },
    {
      "type": "AcceptContract",
      "dataschema": "https://api.example.com/schemas/AcceptContract/1.0",
      "description": "Accept the current contract terms"
    }
  ]
}
```

The `dataschema` URI in `GET /commands` catalogue entries now points to `GET /commands/{schema}/{version}` on the same host (e.g. `.../commands/ProposeCounter/1.0`). Schemas are versioned so consumers can pin to a version and the service can evolve commands without breaking existing callers.

#### GET /commands/{schema}/{version} — Versioned schema document

- Returns the raw JSON Schema document (`application/schema+json`)
- Returns `404` if the schema name or version is not found

#### POST /commands
- Request body: CloudEvent (see above)
- The API dereferences `dataschema` and validates `data` against it
- Returns `201` on success, `400` with error detail on validation failure, `401` if unauthorised

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/events` | Log of domain events published by this service (optional `?type=` filter) |
| `POST` | `/events` | Inject a domain event (for testing/simulation only — optional capability) |

### Services (was: Agents)

| Method | Path | Description |
|---|---|---|
| `GET` | `/services` | List all registered services |
| `GET` | `/services/{id}` | Get service detail |
| `POST` | `/services` | Register a new service |
| `DELETE` | `/services/{id}` | Remove a service |
| `POST` | `/services/{id}/pause` | Pause a service |
| `POST` | `/services/{id}/resume` | Resume a service |

---

## 6. Service Descriptor (corrected)

Replaces the "agent descriptor". The `accepts` and `produces` fields are now inverted.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Globally unique service identifier |
| `name` | string | yes | Human-readable name |
| `description` | string | no | What this service does |
| `type` | string | no | Service type classification |
| `accepts` | string[] | yes | **Command** types this service ingests |
| `produces` | string[] | yes | **Event** types this service publishes |
| `status` | string | yes | One of: `running`, `paused`, `stopped`, `error` |

### Example
```json
{
  "id": "negotiation",
  "name": "Contract Negotiation",
  "description": "Ingests negotiation commands and publishes negotiation events",
  "type": "negotiation-service",
  "accepts": ["ProposeCounter", "AcceptContract", "RejectContract"],
  "produces": ["CounterProposed", "ContractAccepted", "ContractRejected"],
  "status": "running"
}
```

---

## 7. Discovery Manifest (corrected)

The `agents` array in `/.well-known/oap` becomes `services`. The service descriptors use the corrected `accepts`/`produces` direction.

---

## 8. Completed Changes

All phases below have been implemented. This section serves as a record of what was changed.

### Phase 1 — Schemas (`protocol/v1/schemas/`)

1. **`agents/registry.json`** — renamed `agentDescriptor/agentRegistration/agentList` → `serviceDescriptor/serviceRegistration/serviceList`; `accepts` = commands ingested, `produces` = events published
2. **`agents/commands.json`** — replaced custom shape with CloudEvent 1.0; replaced `commandList` with `commandCatalogue` (entries: `{type, dataschema, description}`)
3. **`agents/events.json`** — replaced custom shape with CloudEvent 1.0
4. **`observability/tracing.json`** — `agentId/inputEvent/outputCommands` → `serviceId/inputCommand/outputEvents`

### Phase 2 — OpenAPI (`protocol/v1/services/agents/openapi.json`)

5. All `/agents` paths renamed to `/services`
6. Added `POST /commands` (CloudEvent ingestion, 201)
7. `GET /commands` redefined as command catalogue
8. `POST /events` marked as optional simulation endpoint
9. All tags updated ("Agent Registry" → "Service Registry", etc.)

### Phase 3 — Examples (`protocol/v1/examples/`)

10. `agent-descriptor.json` renamed → `service-descriptor.json`
11. `command.json`, `event.json`, `execution-trace.json` rewritten to CloudEvent format
12. `well-known-oap.json` — `agents` array → `services`, descriptor fields corrected

### Phase 4 — Spec docs (`specs/`)

13. `agents/registry.md`, `agents/commands.md`, `agents/events.md`, `agents/lifecycle.md`, `agents/memory.md` — all updated
14. `overview.md`, `discovery.md`, `conformance.md`, `observability/tracing.md` — updated

### Phase 5 — Instructions (`general.instructions.md`)

15. Purpose statement, primitives, REST API surface, examples — all updated to corrected terminology and CloudEvent shapes

### Phase 6 — Website (`website/src/`)

16. Hero subtitle, feature cards, manifest code block, audience copy — updated

### Phase 7 — README

17. Opening paragraphs updated

---

## 9. Post-Refactor Spec Changes

These changes were made after the initial CQRS refactor (sections 1–8) in response to implementer feedback and live testing.

### Discovery manifest — `endpoints` and `service` fields on capabilities

Each capability in `/.well-known/oap` now has two additional fields:
- `service` — links the capability to its implementing service key in `manifest.services` (e.g. `"io.oap.agents"`). Required for the playground and any consumer to resolve the correct base URL.
- `endpoints` — array of `{ method, path, description }` objects listing the REST endpoints the capability exposes. Machine-readable; consumers use this to auto-build request forms.

### Schema versioning — `GET /commands/{schema}/{version}`

`GET /commands/{type}` (single command descriptor) has been **removed**. The schema hosting surface instead uses the same `/commands` path prefix:

| Endpoint | Purpose |
|---|---|
| `GET /commands` | Catalogue: list command types with versioned dataschema URIs |
| `GET /commands/{schema}/{version}` | Return the JSON Schema document (`application/schema+json`) for that command/version |

The `dataschema` URI in `GET /commands` catalogue entries points to `GET /commands/{schema}/{version}` (e.g. `https://api.example.com/commands/ProposeCounter/1.0`). No separate `/schemas` path exists.

---

## 10. What Does NOT Change

- The capability names (`io.oap.agents.*`) — these are protocol namespaces, changing them is a breaking version change
- The URL paths for registry/lifecycle endpoints are now `/services/*` — this was changed as part of this refactor
- Transport bindings (MCP, A2A) — structure unchanged

---

## 10. Implementation Rules

- Never rename capability namespace strings (e.g. `io.oap.agents.commands`) — these are versioned identifiers
- Every CloudEvent `dataschema` URI must use the versioned path pattern: `https://api.example.com/schemas/{Type}/{version}` (e.g. `https://api.example.com/schemas/ProposeCounter/1.0`). Do NOT use the old flat `.json` pattern.
- `POST /commands` returns `201` (not `202`) — the command is accepted and queued; 201 signals the resource was created in the queue
- Schema validation is synchronous; queuing is what happens after validation passes
- The PM / AI Brain / Process Manager concept belongs in the `general.instructions.md` context section, not in the OAP spec itself (it is a caller pattern, not a protocol primitive)
