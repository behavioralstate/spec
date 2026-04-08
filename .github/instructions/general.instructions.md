# OAP — Open Agent Protocol

**OAP (Open Agent Protocol)** is an open protocol that standardises **agent interoperability** — how agents discover each other, exchange events and commands, and observe what happened, across distributed systems.

Any runtime, platform, language, or UI can implement OAP independently.

> Just as Google created **UCP (Universal Commerce Protocol)** to let any business expose shopping capabilities to any agent, OAP lets **anyone expose skills, services, or capabilities** to any agent — without building bespoke integrations.

---

## Who is OAP For

Anyone who has something to offer — a person, a business, a service, an AI agent, a sensor — can expose an OAP manifest describing what they accept and what they produce. Instead of (or alongside) building a website, they expose a `/.well-known/oap` endpoint that any agent in the world can discover and interact with.

**Examples:**

| Who | Accepts (events) | Produces (commands) | How it works internally |
|---|---|---|---|
| Freelance translator | `TranslationRequested` | `TranslationCompleted` | Human behind a keyboard |
| Contract negotiator | `ContractProposed`, `CounterOfferReceived` | `ProposeCounter`, `AcceptContract` | LLM-powered agent |
| IoT temperature sensor | — (pushes events) | `TemperatureReading` | Embedded firmware |
| Pricing engine | `DemandSignalReceived`, `CompetitorPriceChanged` | `AdjustPrice`, `FlagAnomaly` | Python ML pipeline |
| Code reviewer | `PullRequestOpened` | `ReviewCompleted`, `RequestChanges` | LLM-powered API |
| Approval workflow | `ApprovalRequested` | `ApprovalGranted`, `ApprovalDenied` | Human-in-the-loop form |

**OAP doesn't care how the agent works internally.** It only cares about the interaction surface: what events go in, what commands come out, and how to discover the agent.

---

### What is protocol-level (OAP)

- **Agent** — something that accepts events and produces commands
- **Event** — an observation sent to an agent
- **Command** — an intent produced by an agent
- **Execution Trace** — observable record of *what* happened (input, output, duration, success)
- **Discovery** — `/.well-known/oap` manifest
- **Capabilities** — what a runtime supports

### What is implementation-level (any runtime)

- Internal agent architecture — how an agent processes events (rules, ML pipelines, human workflows, etc.)
- Internal memory model — how an agent stores state
- Internal policies — how an agent filters events or arbitrates commands
- Internal tracing annotations — how an agent records step-level detail

A developer working on the **OAP web UI** or any other OAP consumer should only need this document and the JSON Schema files. They should never need to read any specific runtime's source code.

---

## Design Principles

1. **Protocol-first** — define the spec before the implementation; derive code from the protocol, not the other way around
2. **Compose, don't invent** — build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary wire formats
3. **Discoverable by default** — every OAP endpoint exposes a `/.well-known/oap` manifest so consumers can dynamically discover capabilities
4. **Transport-agnostic** — the same agent semantics work over REST, MCP, A2A, or gRPC
5. **Modular capabilities** — implementers choose which capabilities to support; consumers discover what's available at runtime
6. **LLM-readable** — JSON Schema is the canonical format because LLMs can read, generate, and reason about JSON natively
7. **Implementation-agnostic** — OAP defines the interaction surface (events in, commands out); it never prescribes how an agent processes events internally

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
| **Internal agnostic** | Doesn't prescribe how Shopify processes orders | Doesn't prescribe how an agent processes events |

UCP demonstrates the right approach:

- It does not invent a new wire format — it layers on top of existing protocols
- It uses a profile/manifest for capability discovery
- It is modular — implementers choose which capabilities and extensions to support
- It is interoperable by design — explicitly compatible with MCP, A2A, and AP2

OAP follows the same philosophy for the agent domain.

---

## Protocol Scope

### What OAP Owns

- **Interaction primitives** — Agent, Event, Command, Execution Trace
- **Message shapes** — JSON Schema definitions for every protocol message
- **Discovery mechanism** — `/.well-known/oap` manifest structure
- **Service taxonomy** — `io.oap.agents`, `io.oap.observability`
- **Capability model** — composable capabilities with extensions
- **REST API surface** — HTTP endpoints for agent management, event delivery, observability
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
         - Agent, Event, Command, Execution Trace
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

### Agent Descriptor

An **agent descriptor** is the identity card for an agent — what it does, what events it accepts, what commands it produces.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Globally unique agent identifier |
| `name` | string | yes | Human-readable name |
| `description` | string | no | What this agent does |
| `type` | string | no | Agent type classification (e.g. `"negotiator"`, `"sensor"`, `"reviewer"`) |
| `accepts` | string[] | yes | Event types this agent accepts as input |
| `produces` | string[] | yes | Command types this agent can produce as output |
| `status` | string | yes | One of: `"running"`, `"paused"`, `"stopped"`, `"error"` |

The agent descriptor maps directly to an **A2A Agent Card** for multi-agent interoperability.

**Example — a contract negotiation agent:**

```json
{
  "id": "negotiation",
  "name": "Contract Negotiation",
  "description": "Evaluates contract proposals and produces counter-offers",
  "type": "negotiator",
  "accepts": ["ContractProposed", "CounterOfferReceived", "TermsUpdated"],
  "produces": ["ProposeCounter", "AcceptContract", "RejectContract", "RequestClarification"],
  "status": "running"
}
```

**Example — a temperature sensor:**

```json
{
  "id": "warehouse-temp-01",
  "name": "Warehouse Temperature Sensor",
  "type": "sensor",
  "accepts": [],
  "produces": ["TemperatureReading", "TemperatureAlarm"],
  "status": "running"
}
```

Note: there is no `neurons`, `memory`, `guards`, or other internal detail. The protocol does not know or care how the agent works inside.

### Event

An **event** is an immutable observed fact. Events are the **input** to agents.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | Event type identifier (e.g. `"ContractProposed"`, `"DemandSignalReceived"`) |
| `data` | object | yes | The event payload — structure is domain-specific |
| `metadata` | object (string→string) | yes | Key-value metadata (correlation ID, source, timestamp, etc.) |

Events are:
- Immutable
- Externally produced
- Semantically opaque to the protocol (the protocol does not interpret `data`)

**Example:**

```json
{
  "type": "ContractProposed",
  "data": { "salary": 95000, "startDate": "2025-09-01", "benefits": ["health", "dental"] },
  "metadata": { "correlationId": "abc-123", "source": "hr-system", "timestamp": "2025-07-01T10:30:00Z" }
}
```

### Command

A **command** is an intent to change the system. Agents **produce** commands but **do not execute** them.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | Command type identifier (e.g. `"ProposeCounter"`, `"AdjustPrice"`) |
| `data` | object | yes | The command payload — structure is domain-specific |
| `metadata` | object (string→string) | yes | Key-value metadata (agent ID, trace ID, correlation ID, etc.) |

Commands are handled by external actuators, which then emit new events — closing the loop.

**Example:**

```json
{
  "type": "ProposeCounter",
  "data": { "salary": 100000, "startDate": "2025-09-01" },
  "metadata": { "agentId": "negotiation", "traceId": "trace-001", "correlationId": "abc-123" }
}
```

### Execution Trace

An **execution trace** is the observable record of what happened when an agent processed an event. It captures the **input, output, timing, and outcome** — but NOT how the agent worked internally.

| Field | Type | Required | Description |
|---|---|---|---|
| `traceId` | string | yes | Unique trace identifier |
| `agentId` | string | yes | Which agent processed the event |
| `inputEvent` | Event | yes | The event that triggered processing |
| `outputCommands` | Command[] | yes | Commands the agent produced (may be empty) |
| `startedAt` | datetime | yes | ISO 8601 timestamp |
| `completedAt` | datetime | yes | ISO 8601 timestamp |
| `duration` | duration | yes | ISO 8601 duration |
| `succeeded` | boolean | yes | Whether processing completed without error |
| `error` | string | no | Error message if failed |
| `steps` | TraceStep[] | no | Optional named steps (implementation-specific detail) |

The `steps` field is the **extension point** for implementations. Any runtime can include implementation-specific execution detail here. A simple webhook agent can omit it entirely. The protocol does not prescribe the structure of steps — they are opaque.

#### TraceStep (optional, implementation-specific)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Step name (e.g. `"salary-reasoning"`, `"validate-input"`) |
| `duration` | duration | no | How long this step took |
| `succeeded` | boolean | no | Whether this step succeeded |
| `detail` | object | no | Opaque, implementation-specific detail |

**Example — full execution trace:**

```json
{
  "traceId": "trace-001",
  "agentId": "negotiation",
  "inputEvent": {
    "type": "ContractProposed",
    "data": { "salary": 95000 },
    "metadata": { "correlationId": "abc-123" }
  },
  "outputCommands": [
    {
      "type": "ProposeCounter",
      "data": { "salary": 100000 },
      "metadata": { "agentId": "negotiation", "traceId": "trace-001", "correlationId": "abc-123" }
    }
  ],
  "startedAt": "2025-07-01T10:30:00Z",
  "completedAt": "2025-07-01T10:30:01.234Z",
  "duration": "PT1.234S",
  "succeeded": true,
  "steps": [
    {
      "name": "salary-reasoning",
      "duration": "PT0.800S",
      "succeeded": true,
      "detail": { "note": "Proposed salary is 12% below market median" }
    },
    {
      "name": "start-date-validation",
      "duration": "PT0.050S",
      "succeeded": true
    }
  ]
}
```

---

## Discovery — `/.well-known/oap`

Every OAP-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/oap
Content-Type: application/json
```

This returns a JSON manifest describing the available agents, services, capabilities, and transport bindings. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

### Discovery Flow

1. Consumer hits `/.well-known/oap`
2. Reads the structured manifest
3. Discovers available agents, services, capabilities, and transport bindings
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
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | OAP spec version (date-based: `"YYYY-MM-DD"`) |
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
          "endpoint": "http://localhost:5100/"
        },
        "mcp": {
          "transport": "stdio",
          "server": "oap-mcp"
        }
      },
      "io.oap.observability": {
        "version": "2025-07-01",
        "description": "Execution traces and audit trail",
        "spec": "https://openagentprotocol.io/specs/observability",
        "rest": {
          "openapi": "https://openagentprotocol.io/services/observability/openapi.json",
          "endpoint": "http://localhost:5100/"
        }
      }
    },
    "capabilities": [
      {
        "name": "io.oap.agents.registry",
        "version": "2025-07-01",
        "description": "Register, remove, list agents",
        "spec": "https://openagentprotocol.io/specs/agents/registry",
        "schema": "https://openagentprotocol.io/schemas/agents/registry.json"
      },
      {
        "name": "io.oap.agents.lifecycle",
        "version": "2025-07-01",
        "description": "Pause, resume agents",
        "spec": "https://openagentprotocol.io/specs/agents/lifecycle",
        "schema": "https://openagentprotocol.io/schemas/agents/lifecycle.json",
        "extends": "io.oap.agents.registry"
      },
      {
        "name": "io.oap.agents.events",
        "version": "2025-07-01",
        "description": "Send events to agents, list recent events",
        "spec": "https://openagentprotocol.io/specs/agents/events",
        "schema": "https://openagentprotocol.io/schemas/agents/events.json"
      },
      {
        "name": "io.oap.agents.commands",
        "version": "2025-07-01",
        "description": "List commands produced by agents",
        "spec": "https://openagentprotocol.io/specs/agents/commands",
        "schema": "https://openagentprotocol.io/schemas/agents/commands.json"
      },
      {
        "name": "io.oap.agents.memory",
        "version": "2025-07-01",
        "description": "View agent memory state (opaque to the protocol)",
        "spec": "https://openagentprotocol.io/specs/agents/memory",
        "schema": "https://openagentprotocol.io/schemas/agents/memory.json",
        "extends": "io.oap.agents.registry"
      },
      {
        "name": "io.oap.observability.tracing",
        "version": "2025-07-01",
        "description": "Execution traces — what happened when an agent processed an event",
        "spec": "https://openagentprotocol.io/specs/observability/tracing",
        "schema": "https://openagentprotocol.io/schemas/observability/tracing.json"
      }
    ],
    "agents": [
      {
        "id": "negotiation",
        "name": "Contract Negotiation",
        "description": "Evaluates contract proposals and produces counter-offers",
        "type": "negotiator",
        "accepts": ["ContractProposed", "CounterOfferReceived", "TermsUpdated"],
        "produces": ["ProposeCounter", "AcceptContract", "RejectContract"],
        "status": "running"
      },
      {
        "id": "pricing",
        "name": "Dynamic Pricing",
        "description": "Adjusts prices based on demand signals",
        "type": "pricing-engine",
        "accepts": ["DemandSignalReceived", "CompetitorPriceChanged", "InventoryUpdated"],
        "produces": ["AdjustPrice", "FlagAnomaly"],
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

### io.oap.observability

Execution traces and audit trail.

| Field | Value |
|---|---|
| Namespace | `io.oap.observability` |
| Description | Execution traces and audit trail |
| Spec | `https://openagentprotocol.io/specs/observability` |

---

## Capabilities

Capabilities are the building blocks of OAP. They define specific actions within a service. Capabilities are **composable** — extensions augment core capabilities.

### Capability Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Fully qualified capability name (e.g. `"io.oap.agents.registry"`) |
| `version` | string | yes | Capability version (date-based) |
| `description` | string | yes | Human-readable description |
| `spec` | string | yes | URL to the capability specification |
| `schema` | string | yes | URL to the JSON Schema for this capability |
| `extends` | string | no | Parent capability this extends |
| `status` | string | no | `"planned"` if not yet available; omitted if active |

### Core Capabilities

| Capability | Description |
|---|---|
| `io.oap.agents.registry` | Register, remove, list, get agents |
| `io.oap.agents.events` | Send events to agents, list recent events |
| `io.oap.agents.commands` | List commands produced by agents |
| `io.oap.observability.tracing` | Execution traces — what happened when an agent processed an event |

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

An OAP endpoint **selectively exposes** only the capabilities it supports. A minimal deployment might only support `agents.registry` and `agents.events`. A full deployment adds lifecycle, memory, tracing, planning, and tools. Consumers discover what's available by reading the manifest.

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
  "endpoint": "http://localhost:5100/"
},
"mcp": {
  "transport": "stdio",
  "server": "oap-mcp"
},
"a2a": {
  "agent_card_url": "http://localhost:5100/.well-known/agent.json"
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

### A2A — The Agent Transport

Agents can expose themselves as **A2A agents** (Google Agent-to-Agent protocol) for multi-agent coordination:

| A2A Concept | OAP Mapping |
|---|---|
| **Agent Card** | Agent descriptor |
| **Task** | An execution trace (agent processed an event) |
| **Message** | Event or Command |
| **Artifact** | Execution Trace |

---

## REST API Surface

This section defines the HTTP API that a **web UI** or any REST consumer uses to interact with an OAP endpoint. All endpoints return `application/json`.

> **`rest.endpoint` is the consumer-facing base URL** for all paths below. It must be a public address reachable by external consumers — never an internal backend URL or private service-mesh address. If a backend URL already exists in your codebase, verify it is also the consumer-facing address before using it as `rest.endpoint`.

> **Multi-tenant routing:** For SaaS platforms serving multiple tenants, prefix all tenant-scoped paths with `{tenantId}` (e.g. `/{tenantId}/agents`, `/{tenantId}/events`). Set `rest.endpoint` to the root consumer URL without a tenant segment. The `{tenantId}` path parameter must be declared in `rest.openapi`. Authentication (a Bearer API key) identifies the caller; `{tenantId}` identifies which tenant to target.

### Discovery

| Method | Path | Description | Capability |
|---|---|---|---|
| GET | `/.well-known/oap` | Discovery manifest | — (always available) |

### Agent Registry (`io.oap.agents.registry`)

| Method | Path | Description |
|---|---|---|
| GET | `/agents` | List all registered agents |
| GET | `/agents/{id}` | Get agent detail |
| POST | `/agents` | Register a new agent |
| DELETE | `/agents/{id}` | Remove an agent |

#### GET /agents — List agents

Response:

```json
{
  "agents": [
    {
      "id": "negotiation",
      "name": "Contract Negotiation",
      "description": "Evaluates contract proposals and produces counter-offers",
      "type": "negotiator",
      "accepts": ["ContractProposed", "CounterOfferReceived"],
      "produces": ["ProposeCounter", "AcceptContract"],
      "status": "running"
    }
  ]
}
```

#### GET /agents/{id} — Agent detail

Response: a single agent descriptor object.

#### POST /agents — Register agent

Request body: an agent descriptor (without `status` — defaults to `"stopped"`).

Response: `201 Created` with the created agent descriptor.

#### DELETE /agents/{id} — Remove agent

Response: `204 No Content` on success.

### Agent Lifecycle (`io.oap.agents.lifecycle`)

| Method | Path | Description |
|---|---|---|
| POST | `/agents/{id}/pause` | Pause a running agent |
| POST | `/agents/{id}/resume` | Resume a paused agent |

Response: `204 No Content` on success.

### Event Delivery (`io.oap.agents.events`)

| Method | Path | Description |
|---|---|---|
| POST | `/events` | Send an event to the runtime |
| GET | `/events` | List recent events (with optional `?type=` filter) |

#### POST /events — Send event

Request body:

```json
{
  "type": "ContractProposed",
  "data": { "salary": 95000, "startDate": "2025-09-01" },
  "metadata": { "correlationId": "abc-123", "source": "hr-system" }
}
```

Response: `202 Accepted` — the runtime will route the event to matching agents asynchronously.

### Command Log (`io.oap.agents.commands`)

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | List recently produced commands (with optional `?type=` or `?agentId=` filter) |

### Agent Memory (`io.oap.agents.memory`)

| Method | Path | Description |
|---|---|---|
| GET | `/agents/{id}/memory` | Get current memory state for an agent |

The memory response body is **opaque** — the protocol does not prescribe its structure. Different runtimes return different formats. A key-value runtime returns a JSON object. The web UI renders it as raw JSON.

### Execution Traces (`io.oap.observability.tracing`)

| Method | Path | Description |
|---|---|---|
| GET | `/traces` | List recent execution traces (with optional `?agentId=` filter) |
| GET | `/traces/{traceId}` | Get a specific execution trace |
| GET | `/agents/{id}/traces` | Convenience: list traces for a specific agent |
| GET | `/agents/{id}/traces/latest` | Convenience: get the latest trace for an agent |

#### GET /traces/{traceId} — Trace detail

Response: an Execution Trace object (see Core Protocol Primitives above).

---

## Error Responses

All OAP REST endpoints use standard HTTP status codes with a consistent error body:

```json
{
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 'negotiation' is not registered",
    "details": {}
  }
}
```

| Status | When |
|---|---|
| 200 | Success with body |
| 201 | Created (agent registration) |
| 202 | Accepted (async processing, e.g. event delivery) |
| 204 | Success with no body (pause, resume, delete) |
| 400 | Invalid request body (schema validation failure) |
| 404 | Resource not found (agent, trace) |
| 409 | Conflict (agent already registered) |
| 422 | Semantic error (capability not supported) |
| 500 | Internal runtime error |

---

## Versioning Strategy

### Protocol Version

OAP uses **date-based versioning** (following UCP's pattern): `"2025-07-01"`.

The version appears in:
- The `/.well-known/oap` manifest root
- Each service definition
- Each capability definition

### Compatibility Rules

- **Additive changes** (new optional fields, new capabilities) do NOT bump the version
- **Breaking changes** (field removal, type changes, semantic changes) bump the version
- Consumers should ignore unknown fields (forward compatibility)
- Multiple versions can coexist in a manifest (services can have different versions)

### Namespace Convention

All OAP identifiers use reverse domain notation: `io.oap.{service}.{capability}`.

Examples:
- `io.oap.agents.registry`
- `io.oap.agents.events`
- `io.oap.observability.tracing`

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
| `agents.registry` | GET/POST /agents, GET/DELETE /agents/{id} |
| `agents.lifecycle` | POST /agents/{id}/pause, POST /agents/{id}/resume |
| `agents.events` | POST /events, GET /events |
| `agents.commands` | GET /commands |
| `agents.memory` | GET /agents/{id}/memory |
| `observability.tracing` | GET /traces, GET /traces/{traceId} |

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
      { "name": "io.oap.observability.tracing", "version": "2025-07-01", "..." : "..." },

      { "name": "com.example.custom-processing", "version": "2025-07-01",
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
| `execution-trace.schema.json` | Execution Trace (traceId, agentId, input, output, duration, steps) |
| `trace-step.schema.json` | Trace Step (name, duration, succeeded, detail) |

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
| `openapi/observability.openapi.json` | OpenAPI 3.1 spec for the observability service REST API |
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
4. Create `execution-trace.schema.json`
5. Create `trace-step.schema.json`
6. Create `error.schema.json`

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
2. Create `observability.openapi.json` — all endpoints for tracing
3. Ensure all request/response bodies reference the schemas from Phase 0A/0B

**Validation:** Use an OpenAPI linter (e.g. Spectral) to verify spec correctness.

### Phase 0D: Protocol README and Conformance

**Goal:** Document the protocol for external implementers.

Tasks:

1. Create `protocol/v1/README.md` with:
   - Protocol overview and purpose
   - Versioning strategy (date-based, additive-only minor changes)
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
| Execution trace viewer | `observability.tracing` | GET /traces, GET /traces/{traceId} |

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

## Repository Structure & Website Build

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

### Sidebar nav groups

| Group | Items |
|---|---|
| Getting Started | Overview, Discovery |
| Agents | Registry, Lifecycle, Events, Commands, Memory |
| Observability | Tracing |
| Transports | REST, MCP, A2A |
| Reference | Versioning, Conformance |
| Comparisons | OAP vs UCP |

---