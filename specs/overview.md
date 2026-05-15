# BSP Protocol Overview

## What is BSP?

BSP (Behavioral State Protocol) is an open protocol that standardises **agent interoperability** — how agents discover each other, exchange events and commands, and observe what happened, across distributed systems.

> BSP lets **anyone expose skills, services, or capabilities** to any agent — without building bespoke integrations.

## Who is BSP For

Anyone who has something to offer — a person, a business, a service, an AI agent, a sensor — can expose an BSP manifest describing what they accept and what they produce. Instead of (or alongside) building a website, they expose a `/.well-known/bsp` endpoint that any agent in the world can discover and interact with.

| Who | Accepts (commands) | Produces (events) |
|---|---|---|
| Freelance translator | `TranslateDocument` | `DocumentTranslated` |
| Contract negotiation service | `ProposeCounter`, `AcceptContract` | `CounterProposed`, `ContractAccepted` |
| IoT temperature sensor | `ReadTemperature` | `TemperatureRead`, `TemperatureAlarm` |
| Pricing engine | `AdjustPrice`, `FlagAnomaly` | `PriceAdjusted`, `AnomalyFlagged` |
| Code review service | `ReviewPullRequest` | `ReviewCompleted`, `ChangesRequested` |
| Approval workflow | `RequestApproval` | `ApprovalGranted`, `ApprovalDenied` |

**BSP doesn't care how the service works internally.** It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

## Design Principles

1. **Protocol-first** — define the spec before the implementation; derive code from the protocol, not the other way around
2. **Compose, don't invent** — build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary wire formats
3. **Discoverable by default** — every BSP endpoint exposes a `/.well-known/bsp` manifest so consumers can dynamically discover capabilities
4. **Transport-agnostic** — the same agent semantics work over HTTP, MCP, A2A, or gRPC
5. **Modular capabilities** — implementers choose which capabilities to support; consumers discover what's available at runtime
6. **LLM-readable** — JSON Schema is the canonical format because LLMs can read, generate, and reason about JSON natively
7. **Implementation-agnostic** — BSP defines the interaction surface (commands in, events out); it never prescribes how a service processes commands internally

## Protocol Stack

```
Layer 4: BSP Agent Semantics
         Service, Event, Command
         Defined as JSON Schema

Layer 3: Agent Coordination
         A2A (Google Agent-to-Agent) for multi-agent collaboration

Layer 2: LLM / Tool Interface
         MCP (Model Context Protocol) for LLM access

Layer 1: Transport
         JSON-RPC over stdio/SSE | HTTP | gRPC
```

## Core Primitives

| Primitive | Description |
|---|---|
| **Service** | An BSP-compliant domain service that accepts commands and publishes events |
| **Command** | An intent to change the system — sent to a service by any caller (Process Manager, UI, another service) |
| **Event** | An immutable domain fact published by a service as the result of processing a command |

> **BSP is not REST.** There are no resources to manipulate. There are no `GET /orders/{id}`, `PUT /orders/{id}`, or `DELETE /orders/{id}` endpoints. There are only operations to invoke — commands — and facts to observe — events. If you find yourself thinking in nouns and CRUD verbs, step back: BSP is a behaviour-oriented protocol. Think instead: *what is the caller trying to do?* That is a command. *What happened as a result?* That is an event. See [BSP vs REST](/docs/comparisons/rest) for a full comparison.

## Protocol Scope

### What BSP Owns

- Interaction primitives — Service, Event, Command
- Message shapes — JSON Schema definitions for every protocol message
- Discovery mechanism — `/.well-known/bsp` manifest structure
- Service taxonomy — `io.bsp.agents`
- Capability model — composable capabilities with extensions
- HTTP API surface — HTTP endpoints for service management and event/command delivery
- Transport bindings — how services map to HTTP, MCP, and A2A
- Conformance requirements — what it means to be BSP-compliant

### What BSP Does NOT Own

- Internal agent architecture (how an agent processes events)
- Internal memory model (how an agent stores state)
- Internal policies (how an agent filters events or arbitrates commands)
- Runtime implementation
- Event transport infrastructure (Kafka, RabbitMQ, EventStore)
- Domain models (what events and commands mean in a specific business)
- AI/LLM provider integration
- Actuator execution (what happens when a command is dispatched)
- Workflow graphs, durable execution, retries, checkpointing — these are execution runtime concerns, not protocol concerns

### Capability Tiers — Core vs Extended vs Out of Scope

Not everything in the BSP spec carries equal weight. Understanding which parts are mandatory, which are optional, and which are deliberately out of scope is the fastest way to orient yourself as an implementer.

| Tier | Capabilities | What it means |
|---|---|---|
| **Core** | `/.well-known/bsp` discovery · `io.bsp.agents.commands` · `io.bsp.agents.events` | Required for any functional BSP endpoint. A service that implements only these three is fully BSP-compliant. |
| **Extended** | `io.bsp.agents.registry` · `io.bsp.agents.lifecycle` · `io.bsp.agents.queries` | Optional. Declared in the manifest so consumers discover them at runtime. Omitting them does not affect core compliance. |
| **Out of scope** | Execution runtime · workflow orchestration · durable execution · memory contracts · retry policies · checkpointing | BSP never owns these. They belong to the service's internal implementation or a separate execution layer (e.g. Temporal, Durable Functions, an actor runtime). |

<div class="BSP-diagram">
  <div class="BSP-node">
    <div class="BSP-node-title">Core</div>
    <div class="BSP-node-box accent">Discovery<br/>Commands<br/>Events</div>
    <div class="BSP-node-sub">required</div>
  </div>
  <div class="BSP-arrow">
    <div class="BSP-arrow-track">+</div>
  </div>
  <div class="BSP-node">
    <div class="BSP-node-title">Extended</div>
    <div class="BSP-node-box">Registry<br/>Lifecycle<br/>Queries</div>
    <div class="BSP-node-sub">optional — declared in manifest</div>
  </div>
  <div class="BSP-arrow">
    <div class="BSP-arrow-track">+</div>
  </div>
  <div class="BSP-node">
    <div class="BSP-node-title">Out of scope</div>
    <div class="BSP-node-box">Execution runtime<br/>Workflows<br/>Memory</div>
    <div class="BSP-node-sub">never BSP's</div>
  </div>
</div>

> **The core is intentionally small.** A minimal BSP endpoint is three things: a discovery manifest, a command entry point, and an event log. Everything else is additive. Start there.

## Comparison to Google UCP

| | UCP (Google) | BSP |
|---|---|---|
| **Domain** | Commerce | Agent interoperability |
| **Discovery** | `/.well-known/ucp` | `/.well-known/bsp` |
| **Canonical format** | JSON Schema | JSON Schema |
| **Transports** | HTTP, MCP, A2A | HTTP, MCP, A2A |
| **Namespace convention** | `dev.ucp.*` | `io.bsp.*` |

## Versioning

BSP uses **semantic versioning** (`MAJOR.MINOR.PATCH`). Consumers should ignore unknown fields (forward compatibility). A `MAJOR` bump signals breaking changes. See [Versioning](/docs/versioning) for the full compatibility rules.

## Quick Start for Implementers

Getting a minimal BSP endpoint running takes three steps.

**Step 1 — Serve `/.well-known/bsp`**

Return a JSON manifest describing your agent:

```json
GET /.well-known/bsp
{
  "BSP": {
    "version": "{{BSP_VERSION}}",
    "services": {
      "io.bsp.agents": {
        "version": "{{BSP_VERSION}}",
        "http": {
          "openapi": "https://behavioralstate.io/v1/services/agents/openapi.json",
          "endpoint": "https://your-service.example.com/"
        }
      }
    },
    "capabilities": [
      { "name": "io.bsp.agents.registry", "version": "{{BSP_VERSION}}" },
      { "name": "io.bsp.agents.events",   "version": "{{BSP_VERSION}}" },
      { "name": "io.bsp.agents.commands", "version": "{{BSP_VERSION}}" }
    ]
  }
}
```

**Step 2 — Implement the HTTP endpoints**

The minimum set for a functional agent service:

| Method | Path | What it does |
|---|---|---|
| `POST` | `/services` | Register a service |
| `GET` | `/services` | List registered services |
| `GET` | `/events` | Query published domain events |
| `GET` | `/commands` | Browse accepted command types |
| `GET` | `/queries` | Browse available query types |

**Step 3 — Validate**

Run the validation scripts to confirm your endpoint is spec-compliant:

```
node scripts/validate-schemas.mjs
node scripts/validate-examples.mjs
```

> **Tip:** Start with `authentication.type = "none"` while developing. Add bearer or API key auth once the endpoint is working.

## Next Steps

- [Discovery](./discovery.md) — How agents are discovered
- [Agent Registry](./agents/registry.md) — How agents are registered and managed
- [Events](./agents/events.md) — How events are published
- [Commands](./agents/commands.md) — How commands are accepted
- [Design Decisions](./design-decisions.md) — Why BSP is shaped the way it is
- [Transports](./transports/http.md) — HTTP, MCP, and A2A bindings
- [Conformance](./conformance.md) — What it means to be BSP-compliant
