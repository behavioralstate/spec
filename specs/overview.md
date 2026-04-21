# OAP Protocol Overview

## What is OAP?

OAP (Open Agent Protocol) is an open protocol that standardises **agent interoperability** — how agents discover each other, exchange events and commands, and observe what happened, across distributed systems.

> OAP lets **anyone expose skills, services, or capabilities** to any agent — without building bespoke integrations.

## Who is OAP For

Anyone who has something to offer — a person, a business, a service, an AI agent, a sensor — can expose an OAP manifest describing what they accept and what they produce. Instead of (or alongside) building a website, they expose a `/.well-known/oap` endpoint that any agent in the world can discover and interact with.

| Who | Accepts (commands) | Produces (events) |
|---|---|---|
| Freelance translator | `TranslateDocument` | `DocumentTranslated` |
| Contract negotiation service | `ProposeCounter`, `AcceptContract` | `CounterProposed`, `ContractAccepted` |
| IoT temperature sensor | `ReadTemperature` | `TemperatureRead`, `TemperatureAlarm` |
| Pricing engine | `AdjustPrice`, `FlagAnomaly` | `PriceAdjusted`, `AnomalyFlagged` |
| Code review service | `ReviewPullRequest` | `ReviewCompleted`, `ChangesRequested` |
| Approval workflow | `RequestApproval` | `ApprovalGranted`, `ApprovalDenied` |

**OAP doesn't care how the service works internally.** It only cares about the interaction surface: what commands go in, what events come out, and how to discover the service.

## Design Principles

1. **Protocol-first** — define the spec before the implementation; derive code from the protocol, not the other way around
2. **Compose, don't invent** — build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary wire formats
3. **Discoverable by default** — every OAP endpoint exposes a `/.well-known/oap` manifest so consumers can dynamically discover capabilities
4. **Transport-agnostic** — the same agent semantics work over REST, MCP, A2A, or gRPC
5. **Modular capabilities** — implementers choose which capabilities to support; consumers discover what's available at runtime
6. **LLM-readable** — JSON Schema is the canonical format because LLMs can read, generate, and reason about JSON natively
7. **Implementation-agnostic** — OAP defines the interaction surface (commands in, events out); it never prescribes how a service processes commands internally

## Protocol Stack

```
Layer 4: OAP Agent Semantics
         Agent, Event, Command, Execution Trace
         Defined as JSON Schema

Layer 3: Agent Coordination
         A2A (Google Agent-to-Agent) for multi-agent collaboration

Layer 2: LLM / Tool Interface
         MCP (Model Context Protocol) for LLM access

Layer 1: Transport
         JSON-RPC over stdio/SSE | HTTP/REST | gRPC
```

## Core Primitives

| Primitive | Description |
|---|---|
| **Service** | An OAP-compliant domain service that accepts commands and publishes events |
| **Command** | An intent to change the system — sent to a service by any caller (Process Manager, UI, another service) |
| **Event** | An immutable domain fact published by a service as the result of processing a command |
| **Execution Trace** | Observable record of what happened (input, output, duration, success) |

## Protocol Scope

### What OAP Owns

- Interaction primitives — Agent, Event, Command, Execution Trace
- Message shapes — JSON Schema definitions for every protocol message
- Discovery mechanism — `/.well-known/oap` manifest structure
- Service taxonomy — `io.oap.agents`, `io.oap.observability`
- Capability model — composable capabilities with extensions
- REST API surface — HTTP endpoints for agent management, event delivery, observability
- Transport bindings — how services map to REST, MCP, and A2A
- Conformance requirements — what it means to be OAP-compliant

### What OAP Does NOT Own

- Internal agent architecture (how an agent processes events)
- Internal memory model (how an agent stores state)
- Internal policies (how an agent filters events or arbitrates commands)
- Runtime implementation
- Event transport infrastructure (Kafka, RabbitMQ, EventStore)
- Domain models (what events and commands mean in a specific business)
- AI/LLM provider integration
- Actuator execution (what happens when a command is dispatched)

## Comparison to Google UCP

| | UCP (Google) | OAP |
|---|---|---|
| **Domain** | Commerce | Agent interoperability |
| **Discovery** | `/.well-known/ucp` | `/.well-known/oap` |
| **Canonical format** | JSON Schema | JSON Schema |
| **Transports** | REST, MCP, A2A | REST, MCP, A2A |
| **Namespace convention** | `dev.ucp.*` | `io.oap.*` |

## Versioning

OAP uses date-based versioning: `"2026-04-10"`. Consumers should ignore unknown fields (forward compatibility). Multiple versions can coexist in a manifest.

## Quick Start for Implementers

Getting a minimal OAP endpoint running takes three steps.

**Step 1 — Serve `/.well-known/oap`**

Return a JSON manifest describing your agent:

```json
GET /.well-known/oap
{
  "oap": {
    "version": "2025-07-01",
    "services": {
      "io.oap.agents": {
        "version": "2025-07-01",
        "rest": {
          "openapi": "https://openagentprotocol.io/v1/services/agents/openapi.json",
          "endpoint": "https://your-service.example.com/"
        }
      }
    },
    "capabilities": [
      { "name": "io.oap.agents.registry", "version": "2025-07-01" },
      { "name": "io.oap.agents.events",   "version": "2025-07-01" },
      { "name": "io.oap.agents.commands", "version": "2025-07-01" }
    ]
  }
}
```

**Step 2 — Implement the REST endpoints**

The minimum set for a functional agent service:

| Method | Path | What it does |
|---|---|---|
| `POST` | `/agents` | Register an agent |
| `GET` | `/agents` | List registered agents |
| `POST` | `/events` | Inject a domain event (simulation only) |
| `GET` | `/commands` | Browse accepted command types |

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
- [Tracing](./observability/tracing.md) — How execution is traced
- [Transports](./transports/rest.md) — REST, MCP, and A2A bindings
- [Conformance](./conformance.md) — What it means to be OAP-compliant
