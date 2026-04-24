# OAP — Open Agent Protocol

**OAP (Open Agent Protocol)** is an open protocol that makes **command-and-event service patterns discoverable and interoperable** — ready to be consumed by any caller, including AI agents.

Any runtime, platform, language, or UI can implement OAP independently. OAP describes the **interaction surface** of a domain service: what commands it accepts, what events it publishes, and how to discover it. It says nothing about what is behind it.

> OAP lets **anyone expose a domain service** to any caller — a UI, an AI agent, another service — without building bespoke integrations.

---

## Who is OAP For

Anyone who has something to offer — a person, a business, a service, an AI agent, a sensor — can expose an OAP manifest describing what they accept and what they produce. Instead of (or alongside) building a website, they expose a `/.well-known/oap` endpoint that any agent in the world can discover and interact with.

**Examples:**

| Who | Accepts (commands) | Produces (events) | How it works internally |
|---|---|---|---|
| Freelance translator | `TranslateDocument` | `DocumentTranslated` | Human behind a keyboard |
| Contract negotiation service | `ProposeCounter`, `AcceptContract` | `CounterProposed`, `ContractAccepted` | LLM-powered agent or human-in-the-loop |
| IoT temperature sensor | `ReadTemperature` | `TemperatureRead`, `TemperatureAlarm` | Embedded firmware |
| Pricing engine | `AdjustPrice`, `FlagAnomaly` | `PriceAdjusted`, `AnomalyFlagged` | Python ML pipeline |
| Code review service | `ReviewPullRequest` | `ReviewCompleted`, `ChangesRequested` | LLM-powered API |
| Approval workflow | `RequestApproval` | `ApprovalGranted`, `ApprovalDenied` | Human-in-the-loop form |

**OAP doesn't care how the service works internally.** It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

---

### What is protocol-level (OAP)

- **Service** — an OAP-compliant domain service that accepts commands and publishes events
- **Command** — an intent to change the system, sent to a service (CloudEvent wire format)
- **Event** — an immutable domain fact published by a service as the result of processing a command (CloudEvent wire format)
- **Discovery** — `/.well-known/oap` manifest
- **Capabilities** — what a service supports

### What is implementation-level (any runtime)

- Internal service architecture — how a service processes commands (rules, ML pipelines, human workflows, CQRS+ES, etc.)
- Internal memory model — how a service stores state
- Whether a caller is an AI agent, a Process Manager, a UI, or another service

A developer working on the **OAP web UI** or any other OAP consumer should only need this document and the JSON Schema files. They should never need to read any specific runtime's source code.

---

## Design Principles

1. **Protocol-first** — define the spec before the implementation; derive code from the protocol, not the other way around
2. **Compose, don't invent** — build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary wire formats
3. **Discoverable by default** — every OAP endpoint exposes a `/.well-known/oap` manifest so consumers can dynamically discover capabilities
4. **Transport-agnostic** — the same agent semantics work over REST, MCP, A2A, or gRPC
5. **Modular capabilities** — implementers choose which capabilities to support; consumers discover what's available at runtime
6. **LLM-readable** — JSON Schema is the canonical format because LLMs can read, generate, and reason about JSON natively
7. **Implementation-agnostic** — OAP defines the interaction surface (commands in, events out); it never prescribes how a service processes commands internally

---

## Comparison to Google UCP

| | UCP (Google) | OAP |
|---|---|---|
| **Domain** | Commerce (shopping, checkout, payments) | Agent interoperability (events, commands, capabilities) |
| **Discovery** | `/.well-known/ucp` | `/.well-known/oap` |
| **Canonical format** | JSON Schema | JSON Schema |
| **Transports** | REST, MCP, A2A | REST, MCP, A2A |
| **Architecture** | Services, capabilities, extensions | Services, capabilities, extensions |
| **Manifest root key** | `"ucp"` | `"oap"` |
| **Namespace convention** | `dev.ucp.*` | `io.oap.*` |
| **Internal agnostic** | Doesn't prescribe how Shopify processes orders | Doesn't prescribe how a service processes commands |

UCP demonstrates the right approach:

- It does not invent a new wire format — it layers on top of existing protocols
- It uses a profile/manifest for capability discovery
- It is modular — implementers choose which capabilities and extensions to support
- It is interoperable by design — explicitly compatible with MCP, A2A, and AP2

OAP follows the same philosophy for the agent domain.

---

## Protocol Scope

### What OAP Owns

- **Interaction primitives** — Service, Event, Command
- **Message shapes** — JSON Schema definitions for every protocol message
- **Discovery mechanism** — `/.well-known/oap` manifest structure
- **Service taxonomy** — `io.oap.agents`
- **Capability model** — composable capabilities with extensions
- **REST API surface** — HTTP endpoints for service management and event/command delivery
- **Transport bindings** — how services map to REST, MCP, and A2A
- **Conformance requirements** — what it means to be OAP-compliant

### What OAP Does NOT Own

- **Internal agent architecture** — how an agent processes events (brains, neurons, rules, ML pipelines, human workflows)
- **Internal memory model** — how an agent stores state (event sourcing, key-value, vector DB)
- **Internal policies** — how an agent filters events or arbitrates commands (guards, arbiters)
- Runtime implementation (any implementer)
- Event transport infrastructure (Kafka, RabbitMQ, EventStore)
- Domain models (what events and commands mean in a specific business)
- AI/LLM provider integration
- Actuator execution (what happens when a command is dispatched)

---

## OAP Protocol Stack

```
Layer 4: OAP Agent Semantics (what the protocol uniquely defines)
         - Service, Event, Command
         - Defined as JSON Schema
         - The canonical spec that all bindings derive from

Layer 3: Agent Coordination
         - A2A (Google Agent-to-Agent) for multi-agent collaboration
         - Delegation, negotiation, handoff protocols

Layer 2: LLM / Tool Interface
         - MCP (Model Context Protocol) for LLM access
         - Agents as MCP resources, commands as MCP tools
         - Any LLM client becomes a management UI

Layer 1: Transport
         - JSON-RPC over stdio/SSE (MCP standard)
         - HTTP/REST for direct API access
         - gRPC/shared memory (optional native binding)
```

---

## Core Protocol Primitives

These are the interaction concepts that OAP standardises. Every OAP implementation must understand these types. They define the **surface** of agent interaction, not the internal workings.

### Service Descriptor

A **service descriptor** is the identity card for an OAP-compliant service — what commands it accepts and what events it produces.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Globally unique service identifier |
| `name` | string | yes | Human-readable name |
| `description` | string | no | What this service does |
| `type` | string | no | Service type classification (e.g. `"negotiation-service"`, `"pricing-engine"`) |
| `accepts` | string[] | yes | Command types this service ingests |
| `produces` | string[] | yes | Event types this service publishes |
| `status` | string | yes | One of: `"running"`, `"paused"`, `"stopped"`, `"error"` |

The service descriptor maps directly to an **A2A Agent Card** for multi-agent interoperability.

**Example — a contract negotiation service:**

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

**Example — a temperature sensor service:**

```json
{
  "id": "warehouse-temp-01",
  "name": "Warehouse Temperature Sensor",
  "type": "sensor-service",
  "accepts": ["ReadTemperature"],
  "produces": ["TemperatureRead", "TemperatureAlarm"],
  "status": "running"
}
```

Note: there is no `neurons`, `memory`, `guards`, or other internal detail. The protocol does not know or care how the service works inside.

### Event

A **domain event** is an immutable fact published by an OAP-compliant service as the **result of processing a command**. Events use the **CloudEvent 1.0 specification** as wire format.

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string (URI) | yes | URI identifying the service that published this event |
| `type` | string | yes | Event type identifier (e.g. `"CounterProposed"`, `"PriceAdjusted"`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` |
| `time` | string (ISO 8601) | yes | When the event was published |
| `data` | object | yes | The event payload — semantically opaque to the protocol |

Events are:
- Immutable
- Published by the service
- Semantically opaque to the protocol (the protocol does not interpret `data`)

**Example:**

```json
{
  "specversion": "1.0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source": "https://api.example.com/negotiation",
  "type": "CounterProposed",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/events/CounterProposed.json",
  "time": "2025-07-01T10:30:01Z",
  "data": { "salary": 100000, "startDate": "2025-09-01", "contractId": "contract-42" }
}
```

### Command

A **command** is an intent to change the system. It is sent **to** an OAP-compliant service by any caller (a Process Manager, an AI agent, a UI, another service). Commands use the **CloudEvent 1.0 specification** as wire format.

| Field | Type | Required | Description |
|---|---|---|---|
| `specversion` | string | yes | Always `"1.0"` |
| `id` | string | yes | Unique message ID (UUID recommended) |
| `source` | string (URI) | yes | URI identifying the sender |
| `type` | string | yes | Command type identifier (e.g. `"ProposeCounter"`, `"AdjustPrice"`) |
| `datacontenttype` | string | yes | Always `"application/json"` |
| `dataschema` | string (URI) | yes | URI to the JSON Schema for `data` — hosted by the ingestion API |
| `time` | string (ISO 8601) | yes | When the command was created |
| `data` | object | yes | The command payload — validated against `dataschema` before queuing |

**Example:**

```json
{
  "specversion": "1.0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source": "https://pm.example.com/negotiation-agent",
  "type": "ProposeCounter",
  "datacontenttype": "application/json",
  "dataschema": "https://api.example.com/schemas/ProposeCounter/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": { "salary": 100000, "startDate": "2025-09-01" }
}
```

---

## Discovery — `/.well-known/oap`

Every OAP-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/oap
Content-Type: application/json
```

This returns a JSON manifest describing the available services, capabilities, and transport bindings. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

### Discovery Flow

1. Consumer hits `/.well-known/oap`
2. Reads the structured manifest
3. Discovers available services, capabilities, and transport bindings
4. Starts interacting without any hard-coded integration

### Manifest Structure

```
/.well-known/oap                   → what can I do? (discovery)
/schemas/event.json                → what does an event look like? (contract)
/specs/agents/event-delivery       → how does event delivery work? (documentation)
```

### Manifest Root

```json
{
  "oap": {
    "version": "2025-07-01",
    "tenants": { ... },
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | OAP spec version (semver: `"MAJOR.MINOR.PATCH"`) |
| `tenants` | object | no | Multi-tenant manifest discovery. If present, the `tenants.manifest` field is an RFC 6570 URI template with a single `{tenantId}` variable. Consumers expand it to obtain a fully-resolved, self-contained tenant manifest. The root manifest must only declare capabilities it can fulfill directly — tenant-scoped capabilities (e.g. `io.oap.agents.commands`) are omitted from the root and appear only in the tenant manifest. |
| `services` | object | yes | Service definitions with transport bindings. Each service has a `rest` block with two fields: `rest.openapi` (URL to the implementer's OpenAPI spec) and `rest.endpoint` (consumer-facing base URL). |
| `capabilities` | array | yes | Supported capabilities. Each capability has a `schema` field pointing to a **JSON Schema** file for that capability's data structures. Note: `capability.schema` is a JSON Schema, not an OpenAPI spec. It is a different field from `rest.openapi`. |
| `agents` | array | no | Currently registered agents |

### Full Manifest Example

```json
{
  "oap": {
    "version": "2025-07-01",
    "services": {
      "io.oap.agents": {
        "version": "2025-07-01",
        "description": "Agent management, event delivery, command observation",
        "spec": "https://openagentprotocol.io/specs/agents",
        "rest": {
          "openapi": "https://openagentprotocol.io/services/agents/openapi.json",
          "endpoint": "https://your.compliant.oap.endpoint/"
        },
        "mcp": {
          "transport": "http",
          "server": "https://mcp.example.com/mcp",
          "authentication": {
            "type": "apiKey",
            "headers": [
              { "name": "X-Api-Key",   "description": "Your API key" },
              { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
            ],
            "docs": "https://docs.example.com/authentication"
          }
        }
      }
    },
    "capabilities": [
      {
        "name": "io.oap.agents.registry",
        "version": "2025-07-01",
        "service": "io.oap.agents",
        "description": "Register, remove, list agents",
        "spec": "https://openagentprotocol.io/specs/agents/registry",
        "schema": "https://openagentprotocol.io/schemas/agents/registry.json",
        "endpoints": [
          { "method": "GET",    "path": "/services",     "description": "List all registered services" },
          { "method": "POST",   "path": "/services",     "description": "Register a new service" },
          { "method": "GET",    "path": "/services/{id}", "description": "Get service detail" },
          { "method": "DELETE", "path": "/services/{id}", "description": "Remove a service" }
        ]
      },
      {
        "name": "io.oap.agents.lifecycle",
        "version": "2025-07-01",
        "service": "io.oap.agents",
        "description": "Pause, resume agents",
        "spec": "https://openagentprotocol.io/specs/agents/lifecycle",
        "schema": "https://openagentprotocol.io/schemas/agents/lifecycle.json",
        "extends": "io.oap.agents.registry",
        "endpoints": [
          { "method": "POST", "path": "/services/{id}/pause",  "description": "Pause a service" },
          { "method": "POST", "path": "/services/{id}/resume", "description": "Resume a service" }
        ]
      },
      {
        "name": "io.oap.agents.events",
        "version": "2025-07-01",
        "service": "io.oap.agents",
        "description": "Send events to agents, list recent events",
        "spec": "https://openagentprotocol.io/specs/agents/events",
        "schema": "https://openagentprotocol.io/schemas/agents/events.json",
        "endpoints": [
          { "method": "GET",  "path": "/events", "description": "List domain events published by this service" },
          { "method": "POST", "path": "/events", "description": "Inject a domain event (testing/simulation only)" }
        ]
      },
      {
        "name": "io.oap.agents.commands",
        "version": "2025-07-01",
        "service": "io.oap.agents",
        "description": "Discover command types this service accepts and send commands",
        "spec": "https://openagentprotocol.io/specs/agents/commands",
        "schema": "https://openagentprotocol.io/schemas/agents/commands.json",
        "endpoints": [
          { "method": "GET",  "path": "/commands",                         "description": "Command catalogue — list accepted command types with schema URIs" },
          { "method": "POST", "path": "/commands",                         "description": "Command ingestion — send a CloudEvent command" },
          { "method": "GET",  "path": "/commands/{schema}/{version}",  "description": "Get a versioned command schema document" }
        ]
      },
      {
        "name": "io.oap.agents.memory",
        "version": "2025-07-01",
        "service": "io.oap.agents",
        "description": "View agent memory state (opaque to the protocol)",
        "spec": "https://openagentprotocol.io/specs/agents/memory",
        "schema": "https://openagentprotocol.io/schemas/agents/memory.json",
        "extends": "io.oap.agents.registry",
        "endpoints": [
          { "method": "GET", "path": "/services/{id}/memory", "description": "View service memory state" }
        ]
      }
    ],
    "agents": [
      {
        "id": "negotiation",
        "name": "Contract Negotiation",
        "description": "Ingests negotiation commands and publishes negotiation events",
        "type": "negotiation-service",
        "accepts": ["ProposeCounter", "AcceptContract", "RejectContract"],
        "produces": ["CounterProposed", "ContractAccepted", "ContractRejected"],
        "status": "running"
      },
      {
        "id": "pricing",
        "name": "Dynamic Pricing",
        "description": "Ingests pricing commands and publishes pricing events",
        "type": "pricing-engine",
        "accepts": ["AdjustPrice", "FlagAnomaly"],
        "produces": ["PriceAdjusted", "AnomalyFlagged"],
        "status": "paused"
      }
    ]
  }
}
```

---

## Services

Services are top-level domains the runtime supports. Each service has its own version, spec URL, and transport bindings.

### io.oap.agents

The core agent service — agent management, event delivery, command observation, agent memory.

| Field | Value |
|---|---|
| Namespace | `io.oap.agents` |
| Description | Agent management, event delivery, command observation |
| Spec | `https://openagentprotocol.io/specs/agents` |

---

## Capabilities

Capabilities are the building blocks of OAP. They define specific actions within a service. Capabilities are **composable** — extensions augment core capabilities.

### Capability Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Fully qualified capability name (e.g. `"io.oap.agents.registry"`) |
| `version` | string | yes | Capability version (semver) |
| `description` | string | yes | Human-readable description |
| `spec` | string | yes | URL to the capability specification |
| `schema` | string | yes | URL to the JSON Schema for this capability |
| `service` | string | no | Key of the implementing service in the manifest's `services` object. Required when the capability name prefix does not match the service key (e.g. `io.dotquant.trading` service implementing `io.oap.agents.commands`). Consumers resolve `rest.endpoint` from this field. |
| `extends` | string | no | Parent capability this extends |
| `status` | string | no | `"planned"` if not yet available; omitted if active |
| `endpoints` | array | no | Machine-readable HTTP endpoints exposed by this capability. Each entry: `{ method, path, description }`. Paths are relative to `rest.endpoint`. HTTP method signals read (GET) vs write (POST/DELETE/etc.). Consumers use this to discover catalogue URLs and determine mutability without reading the spec. |

### Core Capabilities

| Capability | Description |
|---|---|
| `io.oap.agents.registry` | Register, remove, list, get agents |
| `io.oap.agents.events` | Send events to agents, list recent events |
| `io.oap.agents.commands` | Discover command types this service accepts and send commands |

### Extension Capabilities

| Capability | Extends | Description |
|---|---|---|
| `io.oap.agents.lifecycle` | `agents.registry` | Pause and resume agents |
| `io.oap.agents.memory` | `agents.registry` | View agent memory state (opaque to protocol) |

### Planned Capabilities

| Capability | Extends | Description |
|---|---|---|
| `io.oap.agents.planning` | `agents.events` | Goal reasoning, plan generation, plan revision |
| `io.oap.agents.tools` | `agents.registry` | Tool registry, discovery, and invocation |

An OAP endpoint **selectively exposes** only the capabilities it supports. A minimal deployment might only support `agents.registry` and `agents.events`. A full deployment adds lifecycle, memory, planning, and tools. Consumers discover what's available by reading the manifest.

### Implementation-Specific Capabilities

Runtimes can expose **additional capabilities** using their own namespace. These are NOT part of OAP core but coexist in the same manifest:

| Example | Description |
|---|---|
| `com.example.custom-processing` | Custom processing pipeline management |
| `com.example.filters` | Pre-execution event filtering and permission checks |
| `com.example.arbitration` | Post-execution command arbitration |

An OAP web UI shows these only if it recognises the namespace. Unknown capabilities are ignored — forward compatibility by design.

---

## Transport Bindings

Each service declares how it can be reached. A consumer chooses the transport that fits their platform.

```json
"rest": {
  "openapi": "https://openagentprotocol.io/services/agents/openapi.json",
  "endpoint": "https://your.compliant.oap.endpoint/"
},
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "authentication": {
    "type": "apiKey",
    "headers": [
      { "name": "X-Api-Key",   "description": "Your API key" },
      { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
    ],
    "docs": "https://docs.example.com/authentication"
  }
},
"a2a": {
  "agent_card_url": "https://your.compliant.oap.endpoint/.well-known/agent.json"
}
```

| Transport | Primary consumer | Protocol |
|---|---|---|
| **REST** | Web UIs, traditional services, monitoring tools | HTTP/JSON |
| **MCP** | LLM clients (ChatGPT, Copilot, Gemini, Ollama, Claude) | JSON-RPC over stdio/SSE |
| **A2A** | Other agents (Google Agent-to-Agent protocol) | HTTP/JSON |
| **gRPC** | Internal native runtime (optional high-performance binding) | Protocol Buffers |

### REST — The Web UI Transport

REST is the primary transport for **web-based consumers** including the OAP web UI. The full REST API is defined by the OpenAPI spec referenced in each service's `rest.openapi` URL.

> **`rest.endpoint` is always the consumer-facing address** — never an internal backend or private service URL. `rest.openapi` describes only the consumer-facing operation surface; internal backend paths must not appear in the spec consumers read.

> **Multiple transports, one surface.** When a service declares both `rest` and `mcp` (or `a2a`), all transports expose the same logical capabilities. They are alternative access methods, not separate operation sets.

### MCP — The LLM Transport

MCP allows any LLM client to manage agents directly:
- Agents are exposed as **MCP resources** (list, read state, read traces)
- Agent management is exposed as **MCP tools** (register, remove, pause, resume)
- Event delivery and command observation are **MCP tools**

The `mcp` transport block supports an optional `authentication` object that tells consumers — including AI agents and IDE tooling (e.g. VS Code Copilot) — what credentials to supply when connecting to the MCP server. The `authentication.headers` array enumerates each required HTTP header with `name`, `description`, and an optional `example` value (useful for pre-filling tenant IDs in per-tenant manifests). Authentication on the `mcp` block is independent of the root `authentication` block, which describes REST API credentials.

### A2A — The Agent Transport

Agents can expose themselves as **A2A agents** (Google Agent-to-Agent protocol) for multi-agent coordination:

| A2A Concept | OAP Mapping |
|---|---|
| **Agent Card** | Agent descriptor |
| **Task** | A command being processed |
| **Message** | Event or Command |

---

## REST API Surface

This section defines the HTTP API that a **web UI** or any REST consumer uses to interact with an OAP endpoint. All endpoints return `application/json`.

> **`rest.endpoint` is the consumer-facing base URL** for all paths below. It must be a public address reachable by external consumers — never an internal backend URL or private service-mesh address. If a backend URL already exists in your codebase, verify it is also the consumer-facing address before using it as `rest.endpoint`.

> **Multi-tenant routing:** For SaaS platforms serving multiple tenants, prefix all tenant-scoped paths with `{tenantId}` (e.g. `/{tenantId}/services`, `/{tenantId}/commands`). Set `rest.endpoint` to the root consumer URL without a tenant segment. The `{tenantId}` path parameter must be declared in `rest.openapi`. Authentication (a Bearer API key) identifies the caller; `{tenantId}` identifies which tenant to target.

### Discovery

| Method | Path | Description | Capability |
|---|---|---|---|
| GET | `/.well-known/oap` | Discovery manifest | — (always available) |

### Service Registry (`io.oap.agents.registry`)

| Method | Path | Description |
|---|---|---|
| GET | `/services` | List all registered services |
| GET | `/services/{id}` | Get service detail |
| POST | `/services` | Register a new service |
| DELETE | `/services/{id}` | Remove a service |

#### GET /services — List services

Response:

```json
{
  "services": [
    {
      "id": "negotiation",
      "name": "Contract Negotiation",
      "description": "Ingests negotiation commands and publishes negotiation events",
      "type": "negotiation-service",
      "accepts": ["ProposeCounter", "AcceptContract"],
      "produces": ["CounterProposed", "ContractAccepted"],
      "status": "running"
    }
  ]
}
```

#### GET /services/{id} — Service detail

Response: a single service descriptor object.

#### POST /services — Register service

Request body: a service descriptor (without `status` — defaults to `"stopped"`).

Response: `201 Created` with the created service descriptor.

#### DELETE /services/{id} — Remove service

Response: `204 No Content` on success.

### Service Lifecycle (`io.oap.agents.lifecycle`)

| Method | Path | Description |
|---|---|---|
| POST | `/services/{id}/pause` | Pause a running service |
| POST | `/services/{id}/resume` | Resume a paused service |

Response: `204 No Content` on success.

### Events (`io.oap.agents.events`)

| Method | Path | Description |
|---|---|---|
| GET | `/events` | List domain events published by this service (optional `?type=` filter) |
| POST | `/events` | Inject a domain event — for testing/simulation only (optional) |

#### GET /events — List published events

Response:

```json
{
  "events": [
    {
      "specversion": "1.0",
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "source": "https://api.example.com/negotiation",
      "type": "CounterProposed",
      "datacontenttype": "application/json",
      "dataschema": "https://api.example.com/schemas/events/CounterProposed.json",
      "time": "2025-07-01T10:30:01Z",
      "data": { "salary": 100000, "contractId": "contract-42" }
    }
  ]
}
```

#### POST /events — Inject event (optional)

Response: `202 Accepted`.

### Commands (`io.oap.agents.commands`)

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | Command catalogue: list accepted command types and their schema URIs |
| POST | `/commands` | Send a command (CloudEvent). Validates `data` against `dataschema`, queues, returns `201`. |
| GET | `/commands/{schema}/{version}` | Return the JSON Schema document for a specific command type and version |

#### GET /commands — Command catalogue

Response:

```json
{
  "commands": [
    {
      "type": "ProposeCounter",
      "dataschema": "https://api.example.com/schemas/ProposeCounter/1.0",
      "description": "Propose a counter-offer in a contract negotiation"
    }
  ]
}
```

#### POST /commands — Send command

Request body: a CloudEvent (see Command wire format above).

Response: `201 Created` — command accepted and queued.

#### GET /commands/{schema}/{version} — Versioned schema document

Returns the JSON Schema document for a specific command type and version. This is the canonical target for the `dataschema` URI in a catalogue entry (e.g. `https://api.example.com/commands/ProposeCounter/1.0`). The response content type is `application/schema+json`.

### Service Memory (`io.oap.agents.memory`)

| Method | Path | Description |
|---|---|---|
| GET | `/services/{id}/memory` | Get current memory state for a service |

The memory response body is **opaque** — the protocol does not prescribe its structure. Different runtimes return different formats. A key-value runtime returns a JSON object. The web UI renders it as raw JSON.

---

## Error Responses

All OAP REST endpoints use standard HTTP status codes with a consistent error body:

```json
{
  "error": {
    "code": "SERVICE_NOT_FOUND",
    "message": "Service 'negotiation' is not registered",
    "details": {}
  }
}
```

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (service registration, command accepted) |
| 202 | Accepted (async processing, e.g. event injection) |
| 204 | Success with no body (pause, resume, delete) |
| 400 | Invalid request body (schema validation failure) |
| 404 | Resource not found (service) |
| 409 | Conflict (service already registered) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

---

## Versioning Strategy

### Protocol Version

OAP uses **semantic versioning** (`MAJOR.MINOR.PATCH`) following [semver.org](https://semver.org) rules. The version string appears in:
- The `/.well-known/oap` manifest root — `oap.version`
- Each service definition — `services["io.oap.*"].version`
- Each capability definition — `capabilities[*].version`

The version string is a **single source of truth that lives in the files themselves**. There is no separate config file or environment variable. When a release is cut, `scripts/release.sh` stamps the new semver version atomically across all files.

### How the Version Gets Bumped — Release Script

The release script (`scripts/release.sh`) handles all version stamping. Never manually edit version strings across files.

```sh
# Cut a stable release, stamp protocol version to match the tag
./scripts/release.sh 1.0.0

# Pre-release with an explicit protocol version
./scripts/release.sh 1.1.0 --prerelease --protocol-version 1.1.0
```

**What `--protocol-version` does:**

1. Auto-detects the current version string already in the files (e.g. `0.4.0`)
2. Replaces it with the new semver in three passes:
   - `"version": "OLD"` → `"version": "NEW"` in all `.json` and `.svelte` files under `protocol/`, `specs/`, `website/src/`
   - `**Version:** OLD` → `**Version:** NEW` in all Markdown spec pages (`specs/**/*.md`)
   - `` `"OLD"` `` → `` `"NEW"` `` for inline backtick references in Markdown body text
3. Shows `git diff --stat` and asks for confirmation before committing
4. Commits as `chore: stamp protocol version to X.Y.Z for release vX.Y.Z` and pushes to main
5. Then creates the git tag and GitHub release

**What it deliberately does NOT touch:**

- `time`, `startedAt`, `completedAt` fields in CloudEvent examples — those are illustrative timestamps, not version signals
- `scripts/release.sh` itself

### Website Version Display

The website hero and every docs page footer display the same version string. It is injected at build time via the `VITE_GIT_TAG` environment variable, which CI sets by running `git describe --tags --always`. This produces:

- **On a tagged release** (e.g. after `release.sh 0.4.0`) → `v0.4.0`, linking to the GitHub release
- **Between releases** (e.g. commits after a tag) → `v0.4.0-14-gabcdef1`, linking to the specific commit

This keeps the version on the website identical to the tag shown in the README. Never reintroduce separate `VITE_GIT_SHA` or `VITE_BUILD_TIME` variables for version display purposes.

**Default behaviour:** if `--protocol-version` is omitted, it defaults to the release version argument.

### Compatibility Rules

| Change type | Bump |
|---|---|
| Breaking changes — field removal, type change, semantic change | `MAJOR` |
| Additive changes — new optional fields, new capabilities | `MINOR` |
| Documentation, clarifications, non-breaking fixes | `PATCH` |

- Consumers must **ignore unknown fields** — forward compatibility
- A `MAJOR` bump signals breaking changes; consumers should review the changelog
- Multiple capabilities can have different versions in the same manifest

### Namespace Convention

All OAP identifiers use reverse domain notation: `io.oap.{service}.{capability}`.

Examples:
- `io.oap.agents.registry`
- `io.oap.agents.events`

Implementation-specific capabilities use their own namespace (e.g. `com.example.custom-capability`).

---

## Conformance Requirements

### Minimal OAP Compliance

A OAP-compliant endpoint **must**:

1. Expose `GET /.well-known/oap` returning a valid manifest
2. Include at least one service in the manifest
3. List all supported capabilities with valid schema URLs
4. Implement the REST API for every listed capability
5. Return valid JSON conforming to the referenced schemas
6. Use standard HTTP status codes and the OAP error response format

### Capability-Level Compliance

For each capability an endpoint claims to support:

| Capability | Required endpoints |
|---|---|
| `agents.registry` | GET /services, POST /services, GET /services/{id}, DELETE /services/{id} |
| `agents.lifecycle` | POST /services/{id}/pause, POST /services/{id}/resume |
| `agents.events` | GET /events, POST /events |
| `agents.commands` | GET /commands, POST /commands, GET /commands/{schema}/{version} |
| `agents.memory` | GET /services/{id}/memory |

### What Compliance Does NOT Require

- A specific programming language or framework
- A specific internal architecture (brains, neurons, pipelines, etc.)
- A specific event transport (Kafka, RabbitMQ, etc.)
- MCP or A2A support (REST is the baseline; MCP and A2A are optional transports)
- AI/LLM capabilities (agents can be purely deterministic, human-operated, or anything else)

---

## Implementation Profiles

Runtimes can extend OAP with implementation-specific capabilities. These appear in the same manifest alongside OAP core capabilities, using a different namespace.

### Example Runtime Profile

A runtime exposes OAP core capabilities plus its own extensions:

```json
{
  "oap": {
    "version": "2025-07-01",
    "capabilities": [
      { "name": "io.oap.agents.registry", "version": "2025-07-01", "..." : "..." },
      { "name": "io.oap.agents.events", "version": "2025-07-01", "..." : "..." },

      { "name": "com.example.custom-processing","version": "2025-07-01",
        "description": "Custom agent processing pipeline management",
        "spec": "https://example.com/specs/custom-processing",
        "schema": "https://example.com/schemas/custom-processing.json",
        "extends": "io.oap.agents.registry" },

      { "name": "com.example.filters", "version": "2025-07-01",
        "description": "Pre-execution event filtering and permission checks",
        "extends": "io.oap.agents.events" },

      { "name": "com.example.arbitration", "version": "2025-07-01",
        "description": "Post-execution command arbitration (dedup, conflict resolution)",
        "extends": "io.oap.agents.commands" }
    ]
  }
}
```

An OAP web UI:
- Renders all `io.oap.*` capabilities using its standard UI components
- Renders implementation-specific capabilities only if it has specific support for them
- Ignores unknown namespaces gracefully (forward compatibility)

---

## JSON Schema File Inventory

All schemas live in `protocol/v1/` relative to the repository root.

### Core — Interaction Primitives

| File | Defines |
|---|---|
| `agent-descriptor.schema.json` | Agent descriptor (id, name, accepts, produces, status) |
| `event.schema.json` | Event (type, data, metadata) |
| `command.schema.json` | Command (type, data, metadata) |

### Discovery and Capabilities

| File | Defines |
|---|---|
| `well-known-oap.schema.json` | Structure of the `/.well-known/oap` endpoint response |
| `capability.schema.json` | Capability (name, version, description, spec, schema, extends, status) |
| `service.schema.json` | Service (version, description, spec, transport bindings) |

### Transport and API

| File | Defines |
|---|---|
| `openapi/agents.openapi.json` | OpenAPI 3.1 spec for the agents service REST API |
| `error.schema.json` | Standard OAP error response format |

---

## Development Plan — OAP Protocol

This plan covers the **protocol artefacts only** — JSON Schema files, OpenAPI specs, discovery manifest schema, and conformance tests.

### Phase 0A: Core Schemas

**Goal:** Define the core interaction primitives as JSON Schema.

**Directory:** `protocol/v1/`

Tasks:

1. Create `agent-descriptor.schema.json`
2. Create `event.schema.json`
3. Create `command.schema.json`
4. Create `error.schema.json`

**Validation:** Each schema must be valid JSON Schema Draft 2020-12.

### Phase 0B: Discovery and Capability Schemas

**Goal:** Define the discovery manifest and capability model.

Tasks:

1. Create `capability.schema.json`
2. Create `service.schema.json`
3. Create `well-known-oap.schema.json` (the `/.well-known/oap` response structure)

**Validation:** The full manifest example in this document must validate against `well-known-oap.schema.json`.

### Phase 0C: REST API (OpenAPI)

**Goal:** Define the complete REST API surface as OpenAPI 3.1 specifications.

**Directory:** `protocol/v1/openapi/`

Tasks:

1. Create `agents.openapi.json` — all endpoints for agent registry, lifecycle, events, commands, memory

**Validation:** Use an OpenAPI linter (e.g. Spectral) to verify spec correctness.

### Phase 0D: Protocol README and Conformance

**Goal:** Document the protocol for external implementers.

Tasks:

1. Create `protocol/v1/README.md` with:
   - Protocol overview and purpose
   - Versioning strategy (semver, breaking/minor/patch rules)
   - Namespace convention (`io.oap.{service}.{capability}`)
   - How to read the discovery manifest
   - Conformance checklist
2. Create `protocol/v1/CONFORMANCE.md` with:
   - Minimal compliance requirements
   - Per-capability compliance checklist
   - Example conformance test scenarios
3. Create `protocol/v1/CHANGELOG.md`

### Phase 0E: Conformance Test Suite

**Goal:** Automated tests that verify any OAP implementation is compliant.

Tasks:

1. Create a test harness that takes a base URL as input
2. Tests for discovery: `GET /.well-known/oap` returns valid manifest
3. Tests for each capability: correct endpoints, correct response shapes, correct status codes
4. Schema validation: all responses validate against the referenced JSON Schemas
5. Error handling: invalid requests return correct error format

---

## How the Web UI Consumes OAP

An OAP web UI is a **REST consumer** that:

1. **Discovers** the endpoint by calling `GET /.well-known/oap`
2. **Reads** the manifest to learn which capabilities are available
3. **Adapts** its UI to show only the features the endpoint supports
4. **Calls** REST endpoints for all operations

### Web UI Feature Mapping

| UI Feature | OAP Capability | Key Endpoints |
|---|---|---|
| Agent dashboard (list, status) | `agents.registry` | GET /agents |
| Agent detail | `agents.registry` | GET /agents/{id} |
| Agent controls (pause, resume, remove) | `agents.lifecycle` | POST pause/resume, DELETE |
| Event sending | `agents.events` | POST /events |
| Event stream viewer | `agents.events` | GET /events |
| Command log | `agents.commands` | GET /commands |
| Memory inspector | `agents.memory` | GET /agents/{id}/memory |

### Capability-Adaptive UI Pattern

The web UI should **never hard-code** which features are available. Instead:

```
1. GET /.well-known/oap
2. Extract capability list from manifest
3. For each UI section, check if the required capability is in the list
4. Show/hide UI sections based on available capabilities
5. Grey out planned capabilities (status: "planned")
6. Render implementation-specific capabilities only if recognised
```

This means the same web UI works with:
- A minimal OAP endpoint (only agents.registry + agents.events)
- A full deployment (all OAP capabilities + implementation-specific extensions)
- A third-party OAP implementation (whatever it supports)

---

## Canonical Format: Why JSON Schema, Not Protocol Buffers

| Factor | JSON Schema | Protocol Buffers |
|---|---|---|
| **MCP compatibility** | MCP uses JSON-RPC 2.0 — native fit | Would require translation layer |
| **A2A compatibility** | A2A uses JSON — native fit | Would require translation layer |
| **LLM readability** | LLMs can read, generate, and reason about JSON | Binary format, opaque to LLMs |
| **Web ecosystem** | Universal — every language, every platform | Requires codegen tooling |
| **Human readability** | Readable and editable | Binary on the wire |
| **Performance** | Adequate for application-level communication | Better for high-throughput internal |

Protocol Buffers are an **optional high-performance binding** for native runtime internals only (gRPC between local agents, shared memory ring buffers). They are mechanically derived from the canonical JSON Schema and never exposed to external consumers.

---

## Summary

OAP is:
- **An open protocol** for agent interoperability — anyone can expose skills, services, or capabilities
- **Transport-agnostic** — works over REST, MCP, A2A, or gRPC
- **Discoverable** — `/.well-known/oap` tells consumers everything they need
- **Modular** — capabilities are composable; implementers choose what to support
- **LLM-native** — JSON Schema is readable by both humans and language models
- **Implementation-agnostic** — the protocol defines the interaction surface, not the internal architecture

OAP is NOT:
- A runtime (any implementation can conform to the protocol)
- A wire format (it layers on existing transports)
- An AI framework (agents can be human, deterministic, AI-powered, or anything)
- An architecture prescription (no internal processing models required)
- Tied to any language (any language can implement the protocol)

---

## Spec Changelog (implementation-relevant decisions)

**2026-04-22**

- **MCP transport `authentication` block** — the `mcp` transport object in the manifest now supports an optional `authentication` field. This is distinct from the root-level `authentication` block (which describes REST API credentials). The `mcp.authentication` block describes what credentials to supply when connecting to the MCP server specifically.
- **`mcp.authentication.headers` array** — for `apiKey` type auth, use the `headers` array to enumerate every required HTTP header. Each entry has `name` (required), `description` (optional), and `example` (optional). The `example` field is a tooling hint — a per-tenant manifest may pre-fill a tenant-scoped header's `example` with the resolved tenant ID so IDE tooling (e.g. VS Code Copilot) can generate a complete, ready-to-use MCP server config.
- **`mcp.transport` now accepts `"http"`** — the `http` value (Streamable HTTP, MCP spec 2025-03-26) is now a valid `transport` type alongside `"stdio"` and `"sse"`. Use `"http"` when the MCP server is accessed over an HTTP endpoint URL.
- **Root `authentication` vs `mcp.authentication` are independent.** Each transport declares its own auth requirements. An endpoint may use Bearer for REST and multi-header API key for MCP, or the same mechanism for both.

**2026-04-08**

- `rest.schema` renamed to `rest.openapi` throughout — the field in the `rest` transport block of a service is now `openapi`, not `schema`. The `schema` field still exists on **capability** objects (pointing to a JSON Schema file) — these are different fields. Do not confuse them.
- Capability `status` field now supports `"partial"` in addition to `"active"` and `"planned"`. Use `"partial"` when a backing service exists but does not cover all required endpoints for a capability. A capability declared `"active"` must implement all required endpoints.
- `rest.endpoint` must always be the **consumer-facing public URL** — never an internal backend or private service-mesh address. If a backend URL already exists in a codebase, verify it is also the consumer-facing address before using it as `rest.endpoint`.
- `rest.openapi` must describe only the **consumer-facing API surface** — internal backend paths must not appear in the spec consumers read.
- Multiple transports (`rest`, `mcp`, `a2a`) on a service expose the **same capability surface** — they are alternative access methods, not separate operation sets.
- Multi-tenant SaaS pattern: prefix all tenant-scoped paths with `{tenantId}` (e.g. `/{tenantId}/agents`). `rest.endpoint` stays as the root consumer URL. The `{tenantId}` path parameter is declared in `rest.openapi`. Bearer auth identifies the caller; `{tenantId}` identifies the tenant.
- Events capability: implementers may map domain-specific records (signals, logs, trade history) to the OAP event shape at query time. `POST /events` can be declared `"partial"` if no live event store exists.
- `well-known-uap.json` example was an orphaned leftover from an earlier "UAP" working name — it has been deleted.
- The website build injects `VITE_GIT_TAG` via Docker build args (set in `cicd.yaml` `docker-publish` step). The value comes from `git describe --tags --always`. Do not reintroduce `VITE_GIT_SHA` or `VITE_BUILD_TIME` for version display.
- The website is built **inside Docker** (`Dockerfile`) not in the CI `build` job — env vars must be passed as `--build-arg` to `docker build`, which the Dockerfile then exposes as `ENV` before running `npm run build`.
- **Canonical `tenants.manifest` URI shape:** `https://host/.well-known/oap/{tenantId}` — the `{tenantId}` segment trails the canonical `/.well-known/oap` path. Never use path-prefix patterns like `/api/oap/tenants/{tenantId}/.well-known/oap`.
- **Playground two-step tenant discovery:** When the root manifest has no capabilities but includes a `tenants.manifest` template, the playground automatically shows a "Tenant ID" input strip. The user enters their tenant ID and clicks "Load Tenant"; the playground expands `{tenantId}` and re-fetches the manifest.

---

## Repository Structure & Website Build

### Role of This File vs `specs/`

`general.instructions.md` and `cqrs-es.instructions.md` are **AI context only** — they are never read by the website build pipeline. When you edit the spec:

- Edit `specs/**/*.md` for changes that should appear on the **public website** (`/docs/...` pages)
- Edit `general.instructions.md` to keep the **AI agent** in sync with those same changes
- Both must be updated together; the instructions file is the AI's working copy of the spec, not the source of truth for the website

### Directory Layout

```
spec/                          ← repo root (open VS Code here)
├── .vscode/launch.json        ← F5 debug config (launches website dev server)
├── .github/workflows/cicd.yaml
├── protocol/v1/               ← JSON schemas, OpenAPI specs, examples
├── specs/                     ← Markdown spec documents
├── scripts/                   ← Schema/example validation scripts
├── Dockerfile
└── website/                   ← SvelteKit static site
    ├── scripts/copy-protocol.mjs
    ├── nginx.conf
    └── src/routes/docs/[...slug]/  ← dynamic pages from specs/*.md
```

### Website Stack

- **SvelteKit 2** with Svelte 5, adapter-static (fully prerendered)
- **Vite 6** with `@tailwindcss/vite`
- **marked** for rendering `specs/*.md` → HTML at build time
- **nginx 1.27-alpine** in production (port **3000**, not 80)

### Build Pipeline

1. `node scripts/copy-protocol.mjs` — copies `protocol/v1/` → `website/static/v1/` (prebuild)
2. `vite build` — prerender all pages including dynamic `docs/[...slug]` routes from `specs/*.md`
3. Output: `website/build/` — fully static HTML + protocol artifacts at `/v1/`

### Markdown Link Rewriting

The `+page.server.ts` for `docs/[...slug]` rewrites relative links in rendered markdown:
- `../../protocol/v1/schemas/...` → `/v1/schemas/...` (protocol artifacts)
- `../agents/events.md` → `/docs/agents/events` (other spec pages)

SvelteKit's `handleHttpError` in `svelte.config.js` ignores prerender 404s for `/v1/` paths (static files, not routes).

### Deployment

- **Docker image**: `ghcr.io/openagentprotocol/spec:<commit-sha>` (never use `latest`)
- **Dockerfile**: multi-stage — Node 20 build → nginx 1.27-alpine serve
- **WORKDIR**: `/repo/website` (mirrors real repo layout so script paths resolve correctly)
- **Health endpoint**: `/healthz` (nginx returns 200, no page load — use for K8s probes)
- **Port**: 3000 (container + K8s service + probes)

### CI/CD (GitHub Actions)

4 jobs: `validate` → `build` → `docker-publish` → `update-iac`

- Uses `GITHUB_TOKEN` for GHCR (requires `permissions: packages: write`)
- IaC repo: `Amarcode-Studios/DotQuant.Iac` (cross-org, needs `IAC_PAT` secret)
- Deployment path: configured via `IAC_DEPLOY_PATH` secret
- `update-iac` job creates a PR to update image tag in the K8s deployment file

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `IAC_REPO` | IaC repository (org/repo) |
| `IAC_PAT` | PAT with `contents:write` + `pull-requests:write` on IaC repo |
| `IAC_BRANCH` | Target branch in IaC repo |
| `IAC_DEPLOY_PATH` | Path to K8s deployment.yaml in IaC repo (forward slashes) |

### Debugging

The `.vscode/launch.json` is at the **repo root** (not `website/`). It launches the Vite dev server with `cwd` set to `website/` — press F5 from the repo root.

---

## Website Design System

### Design Philosophy

The public website (dark) and the docs section (light) intentionally use **different themes**. The docs shell overrides the CSS variables scoped to `.docs-shell` — do not break this by applying global light styles.

### Color Tokens (Dark — public site)

These match the dotQuant public site palette exactly:

| Token | Value | Usage |
|---|---|---|
| `--color-bg` | `#0a0e1a` | Global body, hero background |
| `--color-bg-secondary` | `#060912` | Features section, footer |
| `--color-bg-card` | `#111827` | Feature cards, audience cards |
| `--color-border` | `rgba(255,255,255,0.08)` | Subtle borders |
| `--color-text` | `#e2e8f0` | Body text |
| `--color-text-muted` | `#94a3b8` | Subtitles, nav links, card text |
| `--color-accent` | `#3b82f6` | Brand blue (logo, buttons, eyebrows) |
| `--color-accent-hover` | `#60a5fa` | Hover state for accent |

These tokens are defined in `app.css` `:root`.

### Color Tokens (Light — docs section only)

The docs layout (`routes/docs/+layout.svelte`) overrides these on `.docs-shell`:

| Token | Value |
|---|---|
| `--color-bg` | `#ffffff` |
| `--color-bg-secondary` | `#f7f7fc` |
| `--color-bg-card` | `#f1f2f8` |
| `--color-border` | `#e2e4f0` |
| `--color-text` | `#1e1e3f` |
| `--color-text-muted` | `#6b6b8a` |
| `--color-accent` | `#4f46e5` |
| `--color-accent-hover` | `#4338ca` |

### Navigation Bar

Source: `src/lib/components/Navigation.svelte`

- Background: `linear-gradient(180deg, rgba(13,17,32,0.98) 0%, rgba(13,17,32,0.95) 100%)`
- Backdrop: `backdrop-filter: blur(12px)`
- Border: `rgba(255,255,255,0.05)` bottom
- Nav links: `#94a3b8` → `#ffffff` on hover (use `.nav-link` class, not Tailwind utilities)
- Wordmark hides on `max-width: 480px`

### Logo Component

Source: `src/lib/components/Logo.svelte`

- SVG inline component — works on any background (self-contained fill)
- ViewBox `0 0 48 32` (3:2 ratio); accepts `size` prop (height in px, width auto-derived)
- Background fill: `#3b82f6` — must match dotQuant's `--public-nav-accent`
- Inner highlight: `rgba(255,255,255,0.15)` stroke for depth
- Text: "OAP" in white, `font-weight: 800`, `font-size: 15`, `letter-spacing: -0.5`
- Used in both `Navigation.svelte` and `Hero.svelte`
- Favicon (`static/favicon.svg`) uses the same design

### Hero

Source: `src/lib/components/Hero.svelte`

- Background: `#0a0e1a`
- Glow left: `radial-gradient(circle, rgba(59,130,246,0.2) 0%, transparent 70%)`
- Glow right: `radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)`
- Uses `<Logo>` + wordmark instead of a plain eyebrow label
- No stats row — removed as it felt product-marketing, not appropriate for a spec site

### Feature / Audience Cards

Source: `src/lib/components/FeatureCard.svelte`

- Background: `#111827`
- Border: `rgba(255,255,255,0.06)` → hover `rgba(59,130,246,0.3)`
- Box shadow on hover: `0 0 60px rgba(59,130,246,0.15)`
- Title: `#ffffff`; description: `#94a3b8`

### Footer

Source: `src/lib/components/Footer.svelte`

- Background: `#060912`
- Border top: `rgba(255,255,255,0.1)`

### Blockquote Callouts (docs content)

Blockquotes in markdown spec files render as styled callouts. The `+page.server.ts` auto-classifies them by reading the first `<strong>` keyword:

| Markdown | Rendered class | Color |
|---|---|---|
| `> **Tip:** ...` | `.tip` | Green (`#059669`) |
| `> **Note:** ...` | `.tip` | Green (`#059669`) |
| `> **Warning:** ...` | `.warning` | Amber (`#d97706`) |
| `> **Caution:** ...` | `.warning` | Amber (`#d97706`) |
| `> plain text` | (default) | Indigo (`#4f46e5`) |

All blockquotes have a circular icon badge on the left border.

### Docs Landing Page

Source: `routes/docs/+page.svelte`

Contains two sections above the nav group grid:

1. **Flow diagram** — three boxes (Producer → OAP Endpoint → Consumer) with labeled arrows. The center box uses `--color-accent` fill. Stacks vertically on mobile (`max-width: 600px`).
2. **"How it works" steps** — numbered 1–2–3 with indigo circles, each one sentence of implementation guidance.

### Mobile Sidebar

The docs sidebar (`src/lib/components/DocsSidebar.svelte`) is normally `position: fixed; transform: translateX(-100%)` on `max-width: 767px`. A floating action button (☰/×) in the layout toggles it open. `afterNavigate` in the layout auto-closes it on route change. The overlay (`sidebar-overlay`) closes it on tap.

### Docs Content in `app.css`

All heading colors in `.docs-content` use light-theme values (dark text on white), NOT the global dark-theme palette. When editing `.docs-content` styles, always use light values:

- `h1`: `#111827`
- `h2`, `h3`: `#1e2035`
- `h4`: `#374151`
- `strong`: `#111827`
- `code`: color `#4338ca`, background `rgba(79,70,229,0.06)`

---

## Documentation Content Added

### `specs/comparisons/ucp.md`

A comparison page at `/docs/comparisons/ucp` covering:
- Where OAP and UCP converge: `/.well-known` discovery, MCP as transport, A2A compatibility
- Where they diverge: no AP2 payment primitive, caller-responsibility auth, scope (commerce vs general)
- Concrete example: `PaymentRequested` / `PaymentAuthorised` as OAP events/commands
- Summary comparison table

### `specs/overview.md` — Quick Start section

Added a "Quick Start for Implementers" section with 3 steps:
1. Serve `/.well-known/oap` (with full JSON example)
2. Implement the 4 minimum REST endpoints (table)
3. Validate with `node scripts/validate-*.mjs`

Includes a `> **Tip:**` callout demonstrating the auto-classified blockquote system.

### `specs/design-decisions.md`

A design decisions page at `/docs/design-decisions` covering:
- **Command result retrieval** — why `POST /commands` returns 201 (not a sync result); the CQRS write/read side separation; why Event Sourcing is an internal server pattern and clients do NOT get ES semantics from `GET /events` (which returns a server snapshot, not a replayable log); the correlation pattern (`GET /events?correlationId={id}`); polling vs push (webhook/MCP/A2A) and why push is the reliable path; and timeout/silent failure guidance
- **Observability and distributed tracing** — why OAP has no built-in trace capability, how to use OpenTelemetry + W3C TraceContext for distributed tracing across OAP boundaries, the CloudEvents `traceparent` extension for propagating trace context on events, and a summary table of what OAP owns vs what OpenTelemetry owns

### Sidebar nav groups

| Group | Items |
|---|---|
| Getting Started | Overview, Discovery |
| Agents | Registry, Lifecycle, Events, Commands, Memory |
| Transports | REST, MCP, A2A |
| Reference | Versioning, Conformance, Design Decisions |
| Comparisons | OAP vs UCP |

---