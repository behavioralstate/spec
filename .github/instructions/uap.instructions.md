# UAP — Universal Agent Protocol

**UAP (Universal Agent Protocol)** is an open protocol that standardises **agent interoperability** — how agents discover each other, exchange events and commands, and observe what happened, across distributed systems.

UAP is the protocol. **Synion** is the reference runtime that implements it. Any runtime, platform, language, or UI can implement UAP independently.

> Just as Google created **UCP (Universal Commerce Protocol)** to let any business expose shopping capabilities to any agent, UAP lets **anyone expose skills, services, or capabilities** to any agent — without building bespoke integrations.

---

## Who is UAP For

Anyone who has something to offer — a person, a business, a service, an AI agent, a sensor — can expose a UAP manifest describing what they accept and what they produce. Instead of (or alongside) building a website, they expose a `/.well-known/uap` endpoint that any agent in the world can discover and interact with.

**Examples:**

| Who | Accepts (events) | Produces (commands) | How it works internally |
|---|---|---|---|
| Freelance translator | `TranslationRequested` | `TranslationCompleted` | Human behind a keyboard |
| Contract negotiator | `ContractProposed`, `CounterOfferReceived` | `ProposeCounter`, `AcceptContract` | Synion brain with neurons |
| IoT temperature sensor | — (pushes events) | `TemperatureReading` | Embedded firmware |
| Pricing engine | `DemandSignalReceived`, `CompetitorPriceChanged` | `AdjustPrice`, `FlagAnomaly` | Python ML pipeline |
| Code reviewer | `PullRequestOpened` | `ReviewCompleted`, `RequestChanges` | LLM-powered API |
| Approval workflow | `ApprovalRequested` | `ApprovalGranted`, `ApprovalDenied` | Human-in-the-loop form |

**UAP doesn't care how the agent works internally.** It only cares about the interaction surface: what events go in, what commands come out, and how to discover the agent.

---

## Relationship to Synion

| Concern | UAP (this document) | Synion (general.instructions.md) |
|---|---|---|
| **What** | The protocol specification | The reference runtime implementation |
| **Defines** | Agent descriptor, event/command shapes, discovery manifest, REST API surface | Brain units, neurons, memory patches, guards, arbiters, execution engine |
| **Audience** | Any implementer — web UI, CLI, other runtimes, monitoring tools | .NET developers building the Synion kernel and runtime |
| **Artefacts** | JSON Schema files, OpenAPI specs, well-known manifest schema | NuGet packages (Synion.Abstractions, Synion.Runtime, Synion.Mcp) |
| **Repository path** | `protocol/uap/v1/` | `src/` |

### What is protocol-level (UAP)

- **Agent** — something that accepts events and produces commands
- **Event** — an observation sent to an agent
- **Command** — an intent produced by an agent
- **Execution Trace** — observable record of *what* happened (input, output, duration, success)
- **Discovery** — `/.well-known/uap` manifest
- **Capabilities** — what a runtime supports

### What is implementation-level (Synion, or any other runtime)

- **Brain Unit** — Synion's specific agent abstraction
- **Neuron** — Synion's internal reasoning unit
- **MemoryPatch** — Synion's internal memory update mechanism
- **NeuronNote** — Synion's internal tracing annotation
- **NeuroContext** — Synion's internal execution context
- **NeuronResult** — Synion's internal output structure
- **GuardResult** — Synion's internal event filter
- **ArbitrationResult** — Synion's internal command arbitration

A developer working on the **UAP web UI** or any other UAP consumer should only need this document and the JSON Schema files. They should never need to read Synion source code or understand brains and neurons.

---

## Design Principles

1. **Protocol-first** — define the spec before the implementation; derive code from the protocol, not the other way around
2. **Compose, don't invent** — build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary wire formats
3. **Discoverable by default** — every UAP endpoint exposes a `/.well-known/uap` manifest so consumers can dynamically discover capabilities
4. **Transport-agnostic** — the same agent semantics work over REST, MCP, A2A, or gRPC
5. **Modular capabilities** — implementers choose which capabilities to support; consumers discover what's available at runtime
6. **LLM-readable** — JSON Schema is the canonical format because LLMs can read, generate, and reason about JSON natively
7. **Implementation-agnostic** — UAP defines the interaction surface (events in, commands out); it never prescribes how an agent processes events internally

---

## Comparison to Google UCP

| | UCP (Google) | UAP |
|---|---|---|
| **Domain** | Commerce (shopping, checkout, payments) | Agent interoperability (events, commands, capabilities) |
| **Discovery** | `/.well-known/ucp` | `/.well-known/uap` |
| **Canonical format** | JSON Schema | JSON Schema |
| **Transports** | REST, MCP, A2A | REST, MCP, A2A |
| **Architecture** | Services, capabilities, extensions | Services, capabilities, extensions |
| **Manifest root key** | `"ucp"` | `"uap"` |
| **Namespace convention** | `dev.ucp.*` | `io.uap.*` |
| **Internal agnostic** | Doesn't prescribe how Shopify processes orders | Doesn't prescribe how an agent processes events |

UCP demonstrates the right approach:

- It does not invent a new wire format — it layers on top of existing protocols
- It uses a profile/manifest for capability discovery
- It is modular — implementers choose which capabilities and extensions to support
- It is interoperable by design — explicitly compatible with MCP, A2A, and AP2

UAP follows the same philosophy for the agent domain.

---

## Protocol Scope

### What UAP Owns

- **Interaction primitives** — Agent, Event, Command, Execution Trace
- **Message shapes** — JSON Schema definitions for every protocol message
- **Discovery mechanism** — `/.well-known/uap` manifest structure
- **Service taxonomy** — `io.uap.agents`, `io.uap.observability`
- **Capability model** — composable capabilities with extensions
- **REST API surface** — HTTP endpoints for agent management, event delivery, observability
- **Transport bindings** — how services map to REST, MCP, and A2A
- **Conformance requirements** — what it means to be UAP-compliant

### What UAP Does NOT Own

- **Internal agent architecture** — how an agent processes events (brains, neurons, rules, ML pipelines, human workflows)
- **Internal memory model** — how an agent stores state (event sourcing, key-value, vector DB)
- **Internal policies** — how an agent filters events or arbitrates commands (guards, arbiters)
- Runtime implementation (that's Synion, or any other implementer)
- Event transport infrastructure (Kafka, RabbitMQ, EventStore)
- Domain models (what events and commands mean in a specific business)
- AI/LLM provider integration
- Actuator execution (what happens when a command is dispatched)

---

## UAP Protocol Stack

```
Layer 4: UAP Agent Semantics (what the protocol uniquely defines)
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

These are the interaction concepts that UAP standardises. Every UAP implementation must understand these types. They define the **surface** of agent interaction, not the internal workings.

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

The `steps` field is the **extension point** for implementations. A Synion runtime can include neuron-level execution detail here. A simple webhook agent can omit it entirely. The protocol does not prescribe the structure of steps — they are opaque.

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

## Discovery — `/.well-known/uap`

Every UAP-compliant endpoint exposes a standard discovery URL:

```
GET /.well-known/uap
Content-Type: application/json
```

This returns a JSON manifest describing the available agents, services, capabilities, and transport bindings. No prior configuration is needed — a consumer hits the URL and learns everything it needs to interact.

### Discovery Flow

1. Consumer hits `/.well-known/uap`
2. Reads the structured manifest
3. Discovers available agents, services, capabilities, and transport bindings
4. Starts interacting without any hard-coded integration

### Manifest Structure

```
/.well-known/uap                   → what can I do? (discovery)
/schemas/event.json                → what does an event look like? (contract)
/specs/agents/event-delivery       → how does event delivery work? (documentation)
```

### Manifest Root

```json
{
  "uap": {
    "version": "2025-07-01",
    "services": { ... },
    "capabilities": [ ... ],
    "agents": [ ... ]
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | UAP spec version (date-based: `"YYYY-MM-DD"`) |
| `services` | object | yes | Service definitions with transport bindings |
| `capabilities` | array | yes | Supported capabilities with schema URLs |
| `agents` | array | no | Currently registered agents |

### Full Manifest Example

```json
{
  "uap": {
    "version": "2025-07-01",
    "services": {
      "io.uap.agents": {
        "version": "2025-07-01",
        "description": "Agent management, event delivery, command observation",
        "spec": "https://uap.dev/specs/agents",
        "rest": {
          "schema": "https://uap.dev/services/agents/openapi.json",
          "endpoint": "http://localhost:5100/"
        },
        "mcp": {
          "transport": "stdio",
          "server": "synion-mcp"
        }
      },
      "io.uap.observability": {
        "version": "2025-07-01",
        "description": "Execution traces and audit trail",
        "spec": "https://uap.dev/specs/observability",
        "rest": {
          "schema": "https://uap.dev/services/observability/openapi.json",
          "endpoint": "http://localhost:5100/"
        }
      }
    },
    "capabilities": [
      {
        "name": "io.uap.agents.registry",
        "version": "2025-07-01",
        "description": "Register, remove, list agents",
        "spec": "https://uap.dev/specs/agents/registry",
        "schema": "https://uap.dev/schemas/agents/registry.json"
      },
      {
        "name": "io.uap.agents.lifecycle",
        "version": "2025-07-01",
        "description": "Pause, resume agents",
        "spec": "https://uap.dev/specs/agents/lifecycle",
        "schema": "https://uap.dev/schemas/agents/lifecycle.json",
        "extends": "io.uap.agents.registry"
      },
      {
        "name": "io.uap.agents.events",
        "version": "2025-07-01",
        "description": "Send events to agents, list recent events",
        "spec": "https://uap.dev/specs/agents/events",
        "schema": "https://uap.dev/schemas/agents/events.json"
      },
      {
        "name": "io.uap.agents.commands",
        "version": "2025-07-01",
        "description": "List commands produced by agents",
        "spec": "https://uap.dev/specs/agents/commands",
        "schema": "https://uap.dev/schemas/agents/commands.json"
      },
      {
        "name": "io.uap.agents.memory",
        "version": "2025-07-01",
        "description": "View agent memory state (opaque to the protocol)",
        "spec": "https://uap.dev/specs/agents/memory",
        "schema": "https://uap.dev/schemas/agents/memory.json",
        "extends": "io.uap.agents.registry"
      },
      {
        "name": "io.uap.observability.tracing",
        "version": "2025-07-01",
        "description": "Execution traces — what happened when an agent processed an event",
        "spec": "https://uap.dev/specs/observability/tracing",
        "schema": "https://uap.dev/schemas/observability/tracing.json"
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

### io.uap.agents

The core agent service — agent management, event delivery, command observation, agent memory.

| Field | Value |
|---|---|
| Namespace | `io.uap.agents` |
| Description | Agent management, event delivery, command observation |
| Spec | `https://uap.dev/specs/agents` |

### io.uap.observability

Execution traces and audit trail.

| Field | Value |
|---|---|
| Namespace | `io.uap.observability` |
| Description | Execution traces and audit trail |
| Spec | `https://uap.dev/specs/observability` |

---

## Capabilities

Capabilities are the building blocks of UAP. They define specific actions within a service. Capabilities are **composable** — extensions augment core capabilities.

### Capability Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Fully qualified capability name (e.g. `"io.uap.agents.registry"`) |
| `version` | string | yes | Capability version (date-based) |
| `description` | string | yes | Human-readable description |
| `spec` | string | yes | URL to the capability specification |
| `schema` | string | yes | URL to the JSON Schema for this capability |
| `extends` | string | no | Parent capability this extends |
| `status` | string | no | `"planned"` if not yet available; omitted if active |

### Core Capabilities

| Capability | Description |
|---|---|
| `io.uap.agents.registry` | Register, remove, list, get agents |
| `io.uap.agents.events` | Send events to agents, list recent events |
| `io.uap.agents.commands` | List commands produced by agents |
| `io.uap.observability.tracing` | Execution traces — what happened when an agent processed an event |

### Extension Capabilities

| Capability | Extends | Description |
|---|---|---|
| `io.uap.agents.lifecycle` | `agents.registry` | Pause and resume agents |
| `io.uap.agents.memory` | `agents.registry` | View agent memory state (opaque to protocol) |

### Planned Capabilities

| Capability | Extends | Description |
|---|---|---|
| `io.uap.agents.planning` | `agents.events` | Goal reasoning, plan generation, plan revision |
| `io.uap.agents.tools` | `agents.registry` | Tool registry, discovery, and invocation |

A UAP endpoint **selectively exposes** only the capabilities it supports. A minimal deployment might only support `agents.registry` and `agents.events`. A full deployment adds lifecycle, memory, tracing, planning, and tools. Consumers discover what's available by reading the manifest.

### Implementation-Specific Capabilities

Runtimes can expose **additional capabilities** using their own namespace. These are NOT part of UAP core but coexist in the same manifest:

| Example (Synion) | Description |
|---|---|
| `io.synion.neuron-management` | Add, remove, list neurons within a brain unit |
| `io.synion.guards` | Pre-execution event filtering and permission checks |
| `io.synion.arbitration` | Post-execution command arbitration |
| `io.synion.memory-patches` | Structured memory updates (key/value/operation) |

A UAP web UI shows these only if it recognises the namespace. Unknown capabilities are ignored — forward compatibility by design.

---

## Transport Bindings

Each service declares how it can be reached. A consumer chooses the transport that fits their platform.

```json
"rest": {
  "schema": "https://uap.dev/services/agents/openapi.json",
  "endpoint": "http://localhost:5100/"
},
"mcp": {
  "transport": "stdio",
  "server": "synion-mcp"
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

REST is the primary transport for **web-based consumers** including the UAP web UI. The full REST API is defined by the OpenAPI schema referenced in each service's `rest.schema` URL.

### MCP — The LLM Transport

MCP allows any LLM client to manage agents directly:
- Agents are exposed as **MCP resources** (list, read state, read traces)
- Agent management is exposed as **MCP tools** (register, remove, pause, resume)
- Event delivery and command observation are **MCP tools**

### A2A — The Agent Transport

Agents can expose themselves as **A2A agents** (Google Agent-to-Agent protocol) for multi-agent coordination:

| A2A Concept | UAP Mapping |
|---|---|
| **Agent Card** | Agent descriptor |
| **Task** | An execution trace (agent processed an event) |
| **Message** | Event or Command |
| **Artifact** | Execution Trace |

---

## REST API Surface

This section defines the HTTP API that a **web UI** or any REST consumer uses to interact with a UAP endpoint. All endpoints return `application/json`.

### Discovery

| Method | Path | Description | Capability |
|---|---|---|---|
| GET | `/.well-known/uap` | Discovery manifest | — (always available) |

### Agent Registry (`io.uap.agents.registry`)

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

### Agent Lifecycle (`io.uap.agents.lifecycle`)

| Method | Path | Description |
|---|---|---|
| POST | `/agents/{id}/pause` | Pause a running agent |
| POST | `/agents/{id}/resume` | Resume a paused agent |

Response: `204 No Content` on success.

### Event Delivery (`io.uap.agents.events`)

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

### Command Log (`io.uap.agents.commands`)

| Method | Path | Description |
|---|---|---|
| GET | `/commands` | List recently produced commands (with optional `?type=` or `?agentId=` filter) |

### Agent Memory (`io.uap.agents.memory`)

| Method | Path | Description |
|---|---|---|
| GET | `/agents/{id}/memory` | Get current memory state for an agent |

The memory response body is **opaque** — the protocol does not prescribe its structure. Different runtimes return different formats. A Synion runtime returns event-sourced state. A key-value runtime returns a JSON object. The web UI renders it as raw JSON.

### Execution Traces (`io.uap.observability.tracing`)

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

All UAP REST endpoints use standard HTTP status codes with a consistent error body:

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

UAP uses **date-based versioning** (following UCP's pattern): `"2025-07-01"`.

The version appears in:
- The `/.well-known/uap` manifest root
- Each service definition
- Each capability definition

### Compatibility Rules

- **Additive changes** (new optional fields, new capabilities) do NOT bump the version
- **Breaking changes** (field removal, type changes, semantic changes) bump the version
- Consumers should ignore unknown fields (forward compatibility)
- Multiple versions can coexist in a manifest (services can have different versions)

### Namespace Convention

All UAP identifiers use reverse domain notation: `io.uap.{service}.{capability}`.

Examples:
- `io.uap.agents.registry`
- `io.uap.agents.events`
- `io.uap.observability.tracing`

Implementation-specific capabilities use their own namespace:
- `io.synion.neuron-management`
- `io.synion.guards`

---

## Conformance Requirements

### Minimal UAP Compliance

A UAP-compliant endpoint **must**:

1. Expose `GET /.well-known/uap` returning a valid manifest
2. Include at least one service in the manifest
3. List all supported capabilities with valid schema URLs
4. Implement the REST API for every listed capability
5. Return valid JSON conforming to the referenced schemas
6. Use standard HTTP status codes and the UAP error response format

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

Runtimes can extend UAP with implementation-specific capabilities. These appear in the same manifest alongside UAP core capabilities, using a different namespace.

### Synion Profile (example)

A Synion runtime exposes UAP core capabilities plus Synion-specific extensions:

```json
{
  "uap": {
    "version": "2025-07-01",
    "capabilities": [
      { "name": "io.uap.agents.registry", "version": "2025-07-01", "..." : "..." },
      { "name": "io.uap.agents.events", "version": "2025-07-01", "..." : "..." },
      { "name": "io.uap.observability.tracing", "version": "2025-07-01", "..." : "..." },

      { "name": "io.synion.neuron-management", "version": "2025-07-01",
        "description": "Add, remove, list neurons within a brain unit",
        "spec": "https://synion.io/specs/neuron-management",
        "schema": "https://synion.io/schemas/neuron-management.json",
        "extends": "io.uap.agents.registry" },

      { "name": "io.synion.guards", "version": "2025-07-01",
        "description": "Pre-execution event filtering and permission checks",
        "extends": "io.uap.agents.events" },

      { "name": "io.synion.arbitration", "version": "2025-07-01",
        "description": "Post-execution command arbitration (dedup, conflict resolution)",
        "extends": "io.uap.agents.commands" }
    ]
  }
}
```

A UAP web UI:
- Renders all `io.uap.*` capabilities using its standard UI components
- Renders `io.synion.*` capabilities only if it has specific support for them
- Ignores unknown namespaces gracefully (forward compatibility)

---

## JSON Schema File Inventory

All schemas live in `protocol/uap/v1/` relative to the repository root.

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
| `well-known-uap.schema.json` | Structure of the `/.well-known/uap` endpoint response |
| `capability.schema.json` | Capability (name, version, description, spec, schema, extends, status) |
| `service.schema.json` | Service (version, description, spec, transport bindings) |

### Transport and API

| File | Defines |
|---|---|
| `openapi/agents.openapi.json` | OpenAPI 3.1 spec for the agents service REST API |
| `openapi/observability.openapi.json` | OpenAPI 3.1 spec for the observability service REST API |
| `error.schema.json` | Standard UAP error response format |

---

## Development Plan — UAP Protocol

This plan covers the **protocol artefacts only** — JSON Schema files, OpenAPI specs, discovery manifest schema, and conformance tests. It is independent of the Synion runtime development.

### Phase 0A: Core Schemas

**Goal:** Define the core interaction primitives as JSON Schema.

**Directory:** `protocol/uap/v1/`

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
3. Create `well-known-uap.schema.json` (the `/.well-known/uap` response structure)

**Validation:** The full manifest example in this document must validate against `well-known-uap.schema.json`.

### Phase 0C: REST API (OpenAPI)

**Goal:** Define the complete REST API surface as OpenAPI 3.1 specifications.

**Directory:** `protocol/uap/v1/openapi/`

Tasks:

1. Create `agents.openapi.json` — all endpoints for agent registry, lifecycle, events, commands, memory
2. Create `observability.openapi.json` — all endpoints for tracing
3. Ensure all request/response bodies reference the schemas from Phase 0A/0B

**Validation:** Use an OpenAPI linter (e.g. Spectral) to verify spec correctness.

### Phase 0D: Protocol README and Conformance

**Goal:** Document the protocol for external implementers.

Tasks:

1. Create `protocol/uap/v1/README.md` with:
   - Protocol overview and purpose
   - Versioning strategy (date-based, additive-only minor changes)
   - Namespace convention (`io.uap.{service}.{capability}`)
   - How to read the discovery manifest
   - Conformance checklist
2. Create `protocol/uap/v1/CONFORMANCE.md` with:
   - Minimal compliance requirements
   - Per-capability compliance checklist
   - Example conformance test scenarios
3. Create `protocol/uap/v1/CHANGELOG.md`

### Phase 0E: Conformance Test Suite

**Goal:** Automated tests that verify any UAP implementation is compliant.

Tasks:

1. Create a test harness that takes a base URL as input
2. Tests for discovery: `GET /.well-known/uap` returns valid manifest
3. Tests for each capability: correct endpoints, correct response shapes, correct status codes
4. Schema validation: all responses validate against the referenced JSON Schemas
5. Error handling: invalid requests return correct error format

---

## How the Web UI Consumes UAP

A UAP web UI is a **REST consumer** that:

1. **Discovers** the endpoint by calling `GET /.well-known/uap`
2. **Reads** the manifest to learn which capabilities are available
3. **Adapts** its UI to show only the features the endpoint supports
4. **Calls** REST endpoints for all operations

### Web UI Feature Mapping

| UI Feature | UAP Capability | Key Endpoints |
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
1. GET /.well-known/uap
2. Extract capability list from manifest
3. For each UI section, check if the required capability is in the list
4. Show/hide UI sections based on available capabilities
5. Grey out planned capabilities (status: "planned")
6. Render implementation-specific capabilities (io.synion.*) only if recognised
```

This means the same web UI works with:
- A minimal UAP endpoint (only agents.registry + agents.events)
- A full Synion deployment (all UAP capabilities + Synion extensions)
- A third-party UAP implementation (whatever it supports)

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

UAP is:
- **An open protocol** for agent interoperability — anyone can expose skills, services, or capabilities
- **Transport-agnostic** — works over REST, MCP, A2A, or gRPC
- **Discoverable** — `/.well-known/uap` tells consumers everything they need
- **Modular** — capabilities are composable; implementers choose what to support
- **LLM-native** — JSON Schema is readable by both humans and language models
- **Implementation-agnostic** — the protocol defines the interaction surface, not the internal architecture

UAP is NOT:
- A runtime (that's Synion, or any other implementation)
- A wire format (it layers on existing transports)
- An AI framework (agents can be human, deterministic, AI-powered, or anything)
- An architecture prescription (no brains, neurons, or memory models required)
- Tied to any language (any language can implement the protocol)