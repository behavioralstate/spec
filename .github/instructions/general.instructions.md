# Synion

**Synion** (from *syn-* as in **synapsis** + *-ion* as in **neuron**) — the name encodes the two core biological metaphors of the architecture: **synaptic connections** between **neurons**. Just as synapses transmit signals between neurons in the brain, Synion transmits events between reasoning units in a distributed system.

**Synion is an event-driven cognitive runtime - the operating system for AI agents in distributed systems.**

It provides a semantic and execution model where **brain units** process events, activate **neurons**, resolve context and memory, and produce **commands** that are executed by external actuators. Its architectural foundation is rooted in DDD, CQRS, and event sourcing, making agent decision-making **explicit, observable, and auditable**.

---

## Target Vision - The Agent OS

The next wave of AI is autonomous agents. But the infrastructure to run them reliably does not exist yet.

Most agent frameworks today are:

- request/response oriented
- hiding decision-making inside opaque loops
- not aligned with DDD, CQRS, or event sourcing
- building memory, planning, and tool usage as afterthoughts

Synion aims to be the **runtime platform that standardises the agent stack** - providing the foundational layers that every autonomous agent needs:

| Layer | What it handles | Synion approach |
|---|---|---|
| **Agent runtime** | Scheduling, orchestration, reliability | Brain units as process managers with event-driven activation |
| **Memory** | State persistence, recall, context | Event-sourced memory per brain, semantic memory (planned) |
| **Planning** | Goal reasoning, step sequencing | Goal-aware neurons with plan/revise capabilities (planned) |
| **Tool usage** | API calls, external system interaction | Tool registry with schema-described capabilities (planned) |
| **Multi-agent coordination** | Delegation, negotiation, hierarchy | Event-mediated coordination between brain units (planned) |
| **Observability** | Tracing, auditing, debugging | Full execution traces per brain run |
| **Security** | Permissions, guardrails, compliance | Guards, arbiters, and audit trails |

If agents become the next software paradigm, the runtime layer becomes as important as operating systems. Synion is that runtime - built on proven distributed systems patterns rather than ad-hoc agent loops.

### Target Users

- Enterprise copilots and assistants
- Research and analysis agents
- Coding and DevOps agents
- Business process automation agents
- IoT decision-making systems
- Domain-specific AI brains (negotiation, pricing, support escalation)

---

## Motivation and Origins

This project is grounded in the **ES-AI pattern** described in [Use Generative AI with Commands and Events](https://www.dinuzzo.co.uk/2023/08/12/combine-generative-ai-with-commands-and-events/).

The core insight: in a CQRS architecture, normal services **listen to commands and publish events**. An AI Brain does the **opposite** - it **subscribes to events and sends commands**, just like a human user would. This makes it a **process manager**.

Synion formalises this into a reusable cognitive runtime, modelling cognition as a **continuous event to decision to action loop**, grounded in:

- **Domain-Driven Design (DDD)** - brain units as bounded cognitive contexts
- **CQRS and event sourcing** - memory as event-sourced aggregates
- **Process managers / sagas** - brain units orchestrating multi-step workflows
- **Explicit command and event flows** - full auditability of every decision

---

## Core Concepts

### Brain Unit

A **brain unit** is a bounded cognitive process manager responsible for a specific domain slice. It is the primary agent abstraction in Synion.

It:

- subscribes to relevant events
- resolves domain state and memory
- orchestrates neurons
- emits commands
- maintains its own event-sourced memory

Examples:
- negotiation brain
- pricing brain
- support escalation brain
- code review brain

---

### Neuron

A **neuron** is a small, focused reasoning unit inside a brain.

It:

- evaluates a specific concern
- may be deterministic, AI-powered, or a combination
- produces structured outcomes (commands, memory patches, notes)

Examples:
- annual salary reasoning
- start date reasoning
- anomaly detection
- sentiment analysis

---

### Event

An **event** is an observed fact from the system.

Synion treats events as:

- immutable
- externally produced
- semantically opaque to the runtime

Events are the **input to cognition**. They can come from:
- event stores
- message brokers
- logs and sensors
- APIs
- other brain units (enabling multi-agent coordination)

---

### Command

A **command** is an intent to change the system.

Synion:

- produces commands
- does not execute them

Commands are handled by external components (actuators), which then emit new events. This separation of cognition and actuation is fundamental to the architecture.

---

### Memory

Memory represents **brain-specific state** across time. It follows event sourcing mechanics:

1. Get the existing stream of past events by aggregate ID
2. Apply events to build current state
3. Process the incoming context and raise new events

Types of memory:
- **Operational memory** - event-sourced state (negotiation progress, workflow step)
- **Semantic memory** - vector/embedding-based recall for similarity search (planned)
- **Episodic memory** - timestamped event log queryable by time and context (planned)

Memory is resolved and updated during execution, but remains external to the neuron itself.

---

### Tool

A **tool** is an external capability that a neuron can invoke during reasoning (planned).

Tools are:
- registered with schema descriptions (name, parameters, return type)
- discovered by neurons at runtime
- invoked through a standardised abstraction
- observable and auditable

Examples:
- LLM API call
- database query
- REST API invocation
- file system operation

---

## Execution Model

Synion operates as a continuous loop:

Event then Brain Unit then Neurons then Commands then Actuators then Events

More explicitly:

1. An event is observed via IObservedEventSource
2. The IBrainHost routes the event to matching brain units
3. A brain unit guard (IBrainGuard) determines if it should handle the event
4. Domain state and memory are resolved via IBrainDefinition
5. Neurons are selected via INeuronSelector
6. Each neuron processes the NeuroContext and produces a NeuronResult
7. Results are arbitrated via ICommandArbiter (conflict resolution, deduplication)
8. Commands are dispatched via ICommandSink
9. The full execution is recorded via IRunObserver
10. External systems execute commands and emit new events

---

## Architecture Boundaries

Synion **does not own**:

- event transport (Kafka, RabbitMQ, EventStore, etc.)
- command transport
- CloudEvents envelopes
- domain models
- actuator execution

Synion **does own**:

- cognition semantics
- execution flow and scheduling
- neuron orchestration
- context resolution
- memory interaction
- command emission
- tool invocation abstraction
- observability and audit trails
- agent lifecycle management
- security guardrails

---

## Kernel (v1)

The Synion kernel defines a minimal set of abstractions. All types are in the Synion.Abstractions project targeting .NET 10.

### Message Types

#### NeuroContext

The context passed to each neuron during execution.

```csharp
public sealed class NeuroContext
{
    public EventoMessage Event { get; init; } = null!;
    public object? DomainState { get; init; }
    public object? MemoryState { get; init; }
    public CancellationToken CancellationToken { get; init; }
}
```

#### EventoMessage

An immutable observed event.

```csharp
public sealed record EventoMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);
```

#### CommandMessage

An intent to change the system.

```csharp
public sealed record CommandMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);
```

### Core Contracts

#### INeuron

A focused reasoning unit that processes context and produces results.

```csharp
public interface INeuron
{
    string Name { get; }
    Task<NeuronResult> ProcessAsync(NeuroContext context);
}
```

#### NeuronResult

The structured output of a neuron.

```csharp
public sealed class NeuronResult
{
    public IReadOnlyCollection<CommandMessage> Commands { get; init; }
    public IReadOnlyCollection<MemoryPatch> MemoryPatches { get; init; }
    public IReadOnlyCollection<NeuronNote> Notes { get; init; }
}
```

#### NeuronNote

An observable annotation produced during reasoning (for tracing and debugging).

```csharp
public sealed record NeuronNote(
    string NeuronName,
    string Content,
    NeuronNoteLevel Level);

public enum NeuronNoteLevel { Info, Warning, Decision }
```

#### MemoryPatch

A structured update to brain memory.

```csharp
public sealed record MemoryPatch(
    string Key,
    object Value,
    MemoryPatchOperation Operation);

public enum MemoryPatchOperation { Set, Remove, Append }
```

#### IBrainDefinition

Declarative metadata and resolution logic for a brain unit.

```csharp
public interface IBrainDefinition
{
    string Name { get; }
    IReadOnlyCollection<string> SubscribedEventTypes { get; }
    Task<bool> CanHandleAsync(EventoMessage evt, CancellationToken ct = default);
    Task<object?> ResolveDomainStateAsync(EventoMessage evt, CancellationToken ct = default);
    Task<object?> ResolveMemoryAsync(EventoMessage evt, object? domainState, CancellationToken ct = default);
    IReadOnlyCollection<INeuron> Neurons { get; }
}
```

#### IBrainUnit

The executable brain - combines definition with runtime execution.

```csharp
public interface IBrainUnit
{
    IBrainDefinition Definition { get; }
    Task<BrainRunResult> HandleAsync(EventoMessage evt, CancellationToken ct = default);
}
```

### Runtime Contracts

#### IBrainHost

The runtime engine that routes events to brain units and manages the execution loop.

```csharp
public interface IBrainHost
{
    Task StartAsync(CancellationToken ct = default);
    Task StopAsync(CancellationToken ct = default);
    void Register(IBrainUnit brain);
}
```

#### IObservedEventSource

The inbound event stream that the host subscribes to.

```csharp
public interface IObservedEventSource
{
    Task SubscribeAsync(
        IReadOnlyCollection<string> eventTypes,
        Func<EventoMessage, CancellationToken, Task> handler,
        CancellationToken ct = default);
}
```

#### ICommandSink

The outbound channel for dispatching commands produced by brain units.

```csharp
public interface ICommandSink
{
    Task SendAsync(CommandMessage command, CancellationToken ct = default);
    Task SendBatchAsync(IReadOnlyCollection<CommandMessage> commands, CancellationToken ct = default);
}
```

### Policy Contracts

#### IBrainGuard

A pre-execution filter that determines whether a brain should process an event.

```csharp
public interface IBrainGuard
{
    Task<GuardResult> EvaluateAsync(EventoMessage evt, IBrainDefinition brain, CancellationToken ct = default);
}
```

#### GuardResult

```csharp
public sealed record GuardResult(bool Allowed, string? Reason = null);
```

#### INeuronSelector

Determines which neurons should be activated for a given context.

```csharp
public interface INeuronSelector
{
    Task<IReadOnlyCollection<INeuron>> SelectAsync(
        IReadOnlyCollection<INeuron> available,
        NeuroContext context,
        CancellationToken ct = default);
}
```

#### ICommandArbiter

Post-execution arbitration over the commands produced by neurons (deduplication, conflict resolution, prioritisation).

```csharp
public interface ICommandArbiter
{
    Task<ArbitrationResult> ArbitrateAsync(
        IReadOnlyCollection<CommandMessage> commands,
        NeuroContext context,
        CancellationToken ct = default);
}
```

#### ArbitrationResult

```csharp
public sealed class ArbitrationResult
{
    public IReadOnlyCollection<CommandMessage> Approved { get; init; }
    public IReadOnlyCollection<CommandMessage> Rejected { get; init; }
    public string? Reason { get; init; }
}
```

#### IMemoryProvider

Resolves and persists brain memory.

```csharp
public interface IMemoryProvider
{
    Task<object?> LoadAsync(string brainName, string correlationId, CancellationToken ct = default);
    Task SaveAsync(string brainName, string correlationId, IReadOnlyCollection<MemoryPatch> patches, CancellationToken ct = default);
}
```

### Observability Contracts

#### IRunObserver

Receives execution traces for monitoring, debugging, and auditing.

```csharp
public interface IRunObserver
{
    Task OnBrainRunStartedAsync(BrainRun run, CancellationToken ct = default);
    Task OnNeuronExecutedAsync(NeuronExecution execution, CancellationToken ct = default);
    Task OnBrainRunCompletedAsync(BrainRunResult result, CancellationToken ct = default);
}
```

#### BrainRun

```csharp
public sealed class BrainRun
{
    public string RunId { get; init; }
    public string BrainName { get; init; }
    public EventoMessage TriggerEvent { get; init; }
    public DateTimeOffset StartedAt { get; init; }
}
```

#### NeuronExecution

```csharp
public sealed class NeuronExecution
{
    public string RunId { get; init; }
    public string NeuronName { get; init; }
    public NeuronResult Result { get; init; }
    public TimeSpan Duration { get; init; }
    public bool Succeeded { get; init; }
    public string? Error { get; init; }
}
```

#### BrainRunResult

```csharp
public sealed class BrainRunResult
{
    public string RunId { get; init; }
    public string BrainName { get; init; }
    public IReadOnlyCollection<NeuronExecution> Executions { get; init; }
    public IReadOnlyCollection<CommandMessage> EmittedCommands { get; init; }
    public IReadOnlyCollection<MemoryPatch> MemoryPatches { get; init; }
    public DateTimeOffset CompletedAt { get; init; }
    public TimeSpan TotalDuration { get; init; }
    public bool Succeeded { get; init; }
    public string? Error { get; init; }
}
```

---

## AI Integration

AI is not the runtime - it is a capability inside neurons.

A neuron may:
- call an LLM (OpenAI, Anthropic, local models)
- use deterministic rules
- combine both (AI understands meaning, code handles branching)

Synion treats AI as:
- **pluggable** - swap providers without changing brain logic
- **observable** - every AI call is traced
- **constrained** - guards and arbiters limit what AI-driven neurons can do

---

## Design Principles

1. **Event-driven first** - all cognition is triggered by events
2. **Explicit over implicit** - every decision is traceable
3. **Small composable units** - neurons are focused and testable
4. **Domain boundaries respected** - brain units are bounded contexts
5. **Separation of cognition and actuation** - brains think, actuators do
6. **AI as a tool, not the architecture** - the runtime works with or without AI
7. **Observable by default** - every brain run produces a full execution trace
8. **Secure by design** - guards, arbiters, and permissions at every boundary
9. **Protocol-first** - define the spec before the implementation; derive code from the protocol, not the other way around
10. **Compose, don't invent** - build on existing standards (MCP, A2A, JSON Schema) rather than creating proprietary protocols

---

## Protocol Strategy — Synion as a UAP Implementation

Synion is the reference runtime for **UAP (Universal Agent Protocol)**. UAP defines the interaction surface — how agents discover each other, exchange events and commands, and expose capabilities. Synion implements that protocol using brain units, neurons, guards, arbiters, and event-sourced memory.

> The full UAP protocol specification — discovery manifests, REST API surface, JSON Schema inventory, conformance requirements, and development plan — is in **`uap.instructions.md`**. This section covers only how Synion implements UAP.

### How Synion Maps to UAP

| UAP concept | Synion implementation |
|---|---|
| **Agent** | Brain unit (a bounded cognitive process manager) |
| **Event** | EventoMessage routed via IBrainHost to matching brains |
| **Command** | CommandMessage dispatched via ICommandSink |
| **Execution Trace** | BrainRunResult with NeuronExecution steps |
| **Agent Descriptor** | Generated from IBrainDefinition (name, subscribed events, emitted commands) |
| **Discovery** | `/.well-known/uap` served by Synion.Mcp project |

Synion also exposes **implementation-specific capabilities** under the `io.synion.*` namespace:
- `io.synion.neuron-management` — add, remove, list neurons within a brain
- `io.synion.guards` — pre-execution event filtering
- `io.synion.arbitration` — post-execution command conflict resolution
- `io.synion.memory-patches` — structured key/value/operation memory updates

These extend UAP core capabilities and are discoverable in the manifest alongside `io.uap.*` capabilities.

### MCP as the Primary Interface (No Custom UI)

Instead of building a dashboard to manage Synion agents, **Synion exposes itself as an MCP server**. Any LLM client (ChatGPT, GitHub Copilot, Gemini, Ollama, Claude) becomes the management interface:

- "List all running brain units"
- "Create a negotiation brain that subscribes to ContractProposed events"
- "Show me the last 5 execution traces for the pricing brain"
- "Pause the negotiation brain"
- "Add a salary reasoning neuron to the negotiation brain"
- "What commands did the support brain emit in the last hour?"

The LLM **is** the UI. No custom frontend needed.

#### How Synion Maps to MCP

| MCP Concept | Synion Mapping |
|---|---|
| **Resources** | Brain units (state, memory, definition), execution traces, event streams |
| **Tools** | Brain management (register, pause, resume), command emission, event injection |
| **Prompts** | Neuron templates, brain configuration wizards |
| **Subscriptions** | Real-time event stream observation, brain run notifications |

### A2A for Multi-Agent Interoperability

For multi-agent coordination, Synion brain units expose themselves as **A2A agents** (Google Agent-to-Agent protocol). This means Synion brains can collaborate with any A2A-compatible agent, not just other Synion brains.

| A2A Concept | Synion Mapping |
|---|---|
| **Agent Card** | Brain unit descriptor (name, subscribed events, emitted commands) |
| **Task** | A brain run triggered by an event |
| **Message** | Event or Command |
| **Artifact** | BrainRunResult |

### Protocol-First Development Order

1. Define UAP interaction primitives as **JSON Schema** (see `uap.instructions.md`)
2. Derive **C# abstractions** from the schema (Synion.Abstractions)
3. Build **runtime** + **MCP server** (Synion becomes LLM-manageable from day one)
4. Add **A2A support** (multi-agent interop with the broader ecosystem)
5. Optionally add **protobuf binding** for native runtime internal bus (Phase 5)

---

## Gap Analysis - Current State vs Agent OS

### What Is Implemented

| Component | Status | Notes |
|---|---|---|
| NeuroContext | Complete | Public, fully defined |
| EventoMessage | Complete | Public sealed record |
| CommandMessage | Complete | Public sealed record |

### What Is Scaffolded (empty internal types, no members)

| Component | Files | Required API Surface |
|---|---|---|
| IBrainDefinition | IBrainDefinition.cs | Name, SubscribedEventTypes, CanHandleAsync, ResolveDomainStateAsync, ResolveMemoryAsync, Neurons |
| IBrainUnit | IBrainUnit.cs | Definition, HandleAsync |
| INeuron | INeuron.cs | Name, ProcessAsync |
| NeuronResult | NeuronResult.cs | Commands, MemoryPatches, Notes |
| NeuronNote | NeuronNote.cs | NeuronName, Content, Level |
| MemoryPatch | MemoryPatch.cs | Key, Value, Operation |
| IBrainHost | runtime/IBrainHost.cs | StartAsync, StopAsync, Register |
| IObservedEventSource | runtime/IObservedEventSource.cs | SubscribeAsync |
| ICommandSink | runtime/ICommandSink.cs | SendAsync, SendBatchAsync |
| IBrainGuard | policies/IBrainGuard.cs | EvaluateAsync |
| GuardResult | policies/GuardResult.cs | Allowed, Reason |
| INeuronSelector | policies/INeuronSelector.cs | SelectAsync |
| ICommandArbiter | policies/ICommandArbiter.cs | ArbitrateAsync |
| ArbitrationResult | policies/ArbitrationResult.cs | Approved, Rejected, Reason |
| IMemoryProvider | policies/IMemoryProvider.cs | LoadAsync, SaveAsync |
| BrainRun | observability/BrainRun.cs | RunId, BrainName, TriggerEvent, StartedAt |
| BrainRunResult | observability/BrainRunResult.cs | RunId, Executions, EmittedCommands, etc. |
| NeuronExecution | observability/NeuronExecution.cs | RunId, NeuronName, Result, Duration, etc. |
| IRunObserver | observability/IRunObserver.cs | OnBrainRunStartedAsync, OnNeuronExecutedAsync, OnBrainRunCompletedAsync |

### What Is Entirely Missing

| Capability | Description | Priority |
|---|---|---|
| **UAP JSON Schema spec** | Canonical protocol definition (see `uap.instructions.md`) | Phase 0 |
| **MCP server** | Expose Synion as an MCP server so any LLM can manage brain units | Phase 2 |
| **A2A support** | Expose brain units as A2A agents for multi-agent interop | Phase 3 |
| **Planning / Goal reasoning** | Goal representation, plan generation, plan revision, progress tracking | Phase 3 |
| **Tool registry** | Tool discovery, schema description, invocation abstraction, result parsing | Phase 3 |
| **Multi-agent coordination** | Agent-to-agent messaging, delegation, shared blackboard, supervisor/worker patterns | Phase 3 |
| **Semantic memory** | Vector/embedding storage, similarity search, RAG integration | Phase 3 |
| **Episodic memory** | Timestamped queryable event log with consolidation/forgetting | Phase 3 |
| **Agent lifecycle management** | Registration, instantiation, shutdown, health checks, versioning, scaling | Phase 2 |
| **Security / permissions** | Permission model per brain/neuron, rate limiting, content filtering | Phase 2 |
| **Audit trail** | Compliance-grade immutable record of all decisions and actions | Phase 2 |
| **Conversation / interaction model** | Turn-based human-in-the-loop, streaming responses, multi-modal I/O | Phase 3 |
| **Declarative configuration** | JSON brain definitions, hot-reload | Phase 3 |
| **Runtime implementation** | Actual BrainHost implementation that wires everything together | Phase 1 |
| **Default policies** | Default guard (allow all), default selector (all neurons), default arbiter (pass-through) | Phase 1 |
| **Test project** | Unit and integration tests for the kernel | Phase 1 |

---

## Roadmap - Next Steps

### Phase 0: Define the UAP Protocol Spec

**Goal:** Define the canonical UAP primitives as JSON Schema before writing any implementation code. All C# types will be derived from this spec.

The full schema inventory, development plan (Phases 0A–0E), and conformance requirements are in **`uap.instructions.md`**.

Synion-side tasks for Phase 0:

1. Create `protocol/uap/v1/` directory with all UAP JSON Schema files
2. Define `synion-mcp-manifest.json` describing Synion's MCP resources, tools, and prompts
3. Verify all Synion.Abstractions types can be derived from the UAP schemas

### Phase 1: Complete the Kernel Abstractions (derived from spec)

**Goal:** All scaffolded types have their API surfaces defined (derived from the JSON Schema spec), are public, and the project compiles with a coherent contract.

Tasks:

1. **Flesh out core contracts**
   - INeuron - add Name and ProcessAsync(NeuroContext) returning NeuronResult
   - NeuronResult - add Commands, MemoryPatches, Notes collections
   - NeuronNote - convert to sealed record with NeuronName, Content, Level
   - MemoryPatch - convert to sealed record with Key, Value, Operation
   - IBrainDefinition - add full contract as specified in kernel section
   - IBrainUnit - add Definition and HandleAsync

2. **Flesh out runtime contracts**
   - IBrainHost - add StartAsync, StopAsync, Register
   - IObservedEventSource - add SubscribeAsync
   - ICommandSink - add SendAsync, SendBatchAsync

3. **Flesh out policy contracts**
   - IBrainGuard + GuardResult
   - INeuronSelector
   - ICommandArbiter + ArbitrationResult
   - IMemoryProvider

4. **Flesh out observability contracts**
   - BrainRun, BrainRunResult, NeuronExecution
   - IRunObserver

5. **Make all types public** - these are abstractions meant to be implemented by consumers

6. **Fix namespaces** - ensure consistent PascalCase namespace convention (Synion.Abstractions.Runtime, Synion.Abstractions.Policies, Synion.Abstractions.Observability)

7. **Add enums** - NeuronNoteLevel, MemoryPatchOperation

8. **Create test project** - Synion.Abstractions.Tests with basic compilation and contract tests

### Phase 2: Runtime Implementation, MCP Server, and Agent Lifecycle

**Goal:** A working runtime that can receive events, route them to brains, execute neurons, dispatch commands, and be managed by any LLM via MCP.

Tasks:

1. **Create Synion.Runtime project** with:
   - BrainHost - default implementation of IBrainHost
   - DefaultNeuronSelector - selects all neurons
   - DefaultBrainGuard - allows all events
   - PassThroughArbiter - approves all commands
   - InMemoryMemoryProvider - dictionary-based memory for development/testing

2. **Create Synion.Mcp project** - MCP server exposing Synion to LLMs:
   - Expose brain units as MCP resources (list, read state, read memory, read traces)
   - Expose brain management as MCP tools (register, remove, pause, resume)
   - Expose event injection and command emission as MCP tools
   - Expose real-time event stream as MCP subscriptions
   - Support stdio and SSE transports (MCP standard)
   - Implement `/.well-known/uap` discovery endpoint (HTTP)
   - Generate manifest dynamically from registered brains and enabled capabilities
   - This replaces the need for a custom dashboard - any LLM client is the UI

3. **Agent lifecycle management**
   - Brain registration and discovery
   - Health checks and heartbeat
   - Graceful shutdown with in-flight completion

4. **Security foundations**
   - Permission model (which brains can emit which command types)
   - Rate limiting per brain
   - Audit trail (immutable log of all brain runs)

5. **Integration adapters** (separate projects)
   - Synion.EventStore - EventStoreDB event source
   - Synion.RabbitMQ - RabbitMQ event source and command sink
   - Synion.InMemory - in-memory event source and command sink for testing

6. **Integration tests** with end-to-end brain execution scenarios

### Phase 3: Agent OS Capabilities

**Goal:** Elevate Synion from a cognitive runtime to a full agent operating system.

Tasks:

1. **Tool registry and invocation**
   - ITool interface with schema description
   - IToolRegistry for discovery and registration
   - Tool invocation middleware with observability
   - Built-in tools: HTTP client, LLM provider, file operations

2. **Planning and goal reasoning**
   - IGoal and IPlan abstractions
   - Plan-generating neurons
   - Plan revision on new events
   - Progress tracking in memory

3. **Semantic memory**
   - ISemanticMemoryProvider with embedding storage and similarity search
   - Integration with vector databases (Qdrant, Milvus, Azure AI Search)
   - Episodic memory with time-based queries
   - Memory consolidation strategies

4. **Multi-agent coordination via A2A**
   - Expose brain units as A2A agent cards
   - Event-mediated brain-to-brain communication
   - Delegation protocol (brain A asks brain B to handle a sub-task)
   - Supervisor/worker patterns
   - Shared context and conflict resolution
   - Interop with non-Synion A2A agents (Google ecosystem, third-party)

5. **Conversation and interaction model**
   - Human-in-the-loop protocol (via MCP - the LLM mediates approval)
   - Approval workflows (decision support mode)
   - Streaming response support
   - Multi-modal I/O abstraction

6. **Declarative configuration**
   - JSON brain and neuron definitions (aligned with JSON Schema spec from Phase 0)
   - Hot-reload of brain configurations
   - Configuration validation against schema

### Phase 4: Ecosystem and Distribution

**Goal:** Make Synion adoptable and extensible.

Tasks:

1. **NuGet packages** - Synion.Abstractions, Synion.Runtime, Synion.Mcp, adapter packages
2. **Project templates** - dotnet new synion-brain, dotnet new synion-mcp
3. **Documentation site** - architecture guides, tutorials, API reference, protocol spec
4. **Sample brains** - negotiation, support escalation, IoT monitoring
5. **MCP integration guides** - how to connect Synion to ChatGPT, Copilot, Gemini, Ollama
6. **Plugin system** - third-party neuron and tool packages
7. **Protocol conformance tests** - verify any implementation speaks UAP correctly

### Phase 5: Synion Native Runtime and UAP Native Binding

**Goal:** Build a low-level native runtime that makes Synion a true operating system for autonomous agents and robotic systems, with an optional high-performance UAP protobuf binding for internal agent communication.

This phase transforms Synion from an application-level library into a **runtime platform with its own execution model, memory subsystem, and native performance layer**. The cognitive protocol (JSON Schema from Phase 0) remains the canonical spec. This phase adds a high-performance native binding beneath it.

Note: The protocol semantics are already defined in Phase 0 (JSON Schema) and exposed via MCP (Phase 2) and A2A (Phase 3). Phase 5 focuses on the **native runtime** and an **optional Protocol Buffers binding** for internal high-throughput scenarios only.

---

#### 5.1 Protocol Buffers Binding (internal, optional)

For the native runtime's internal event bus, an optional **Protocol Buffers binding** provides zero-copy, high-throughput message passing. This is not the canonical protocol — it is a performance optimization for same-process and same-machine agent communication.

- Protobuf schemas are mechanically derived from the canonical JSON Schema spec
- Used only by Synion.Native internals (shared memory ring buffer, gRPC between local agents)
- External-facing interfaces (MCP, A2A, REST) continue to use JSON
---

#### 5.2 Synion Native Runtime (Synion.Native)

The native runtime is a low-level execution environment purpose-built for agent workloads.

##### Architecture

```
┌──────────────────────────────────────────┐
│  Agent Application (brains, neurons)     │
├──────────────────────────────────────────┤
│  Synion.Runtime (.NET, application-level) │
├──────────────────────────────────────────┤
│  Synion.Native                           │
│  ┌────────────────────────────────────┐  │
│  │  Agent Sandbox (WASM)              │  │
│  │  - per-neuron isolation            │  │
│  │  - capability-based permissions    │  │
│  │  - resource limits (CPU, memory)   │  │
│  ├────────────────────────────────────┤  │
│  │  Memory Subsystem                  │  │
│  │  - event stream storage            │  │
│  │  - vector index (embeddings)       │  │
│  │  - working memory (hot state)      │  │
│  │  - unified address space           │  │
│  ├────────────────────────────────────┤  │
│  │  Native Event Bus                  │  │
│  │  - shared-memory for local agents  │  │
│  │  - zero-serialisation fast path    │  │
│  │  - UAP framing for remote agents   │  │
│  ├────────────────────────────────────┤  │
│  │  Hardware Scheduler                │  │
│  │  - CPU for deterministic neurons   │  │
│  │  - GPU for inference/embeddings    │  │
│  │  - NPU where available             │  │
│  │  - cognitive priority scheduling   │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  Linux / Windows / RTOS                  │
└──────────────────────────────────────────┘
```

##### 5.2.1 Agent Sandbox (WebAssembly)

Run untrusted neuron code in WASM sandboxes:
- Each neuron/plugin gets its own WASM instance
- Capability-based security: a neuron can only access tools and memory it was granted
- Resource limits: CPU time, memory allocation, network calls
- Language-agnostic: neurons can be written in Rust, C, Python (via WASM), not just C#
- Hot-swap: replace a neuron at runtime without restarting the brain

Technology: WASI (WebAssembly System Interface) + wasmtime or similar

##### 5.2.2 Unified Memory Subsystem

A single memory layer that natively handles all agent memory types:
- **Event streams** — append-only, indexed by aggregate ID and time
- **Vector index** — embedding storage with similarity search (ANN)
- **Working memory** — fast key-value state for in-flight brain runs
- **Episodic memory** — time-series queryable log

All in a single subsystem with:
- Memory-mapped I/O for local performance
- Replication for distributed deployments
- Pluggable persistence (disk, cloud storage, embedded DB)

##### 5.2.3 Native Event Bus

Zero-overhead event passing between agents:
- **Same-process agents** — shared memory ring buffer, zero serialisation
- **Same-machine agents** — Unix domain sockets or named pipes
- **Networked agents** — UAP over gRPC/NATS/MQTT (JSON externally, protobuf internally)
- Automatic promotion: starts local, promotes to network when agents are distributed

##### 5.2.4 Hardware-Aware Scheduler

Routes neuron execution to the appropriate hardware:
- **Deterministic neurons** (rules, conditions) — CPU
- **Inference neurons** (LLM, classification) — GPU / NPU
- **Embedding operations** (search, similarity) — GPU
- **Sensor processing** (vision, audio) — dedicated accelerator

Priority-based scheduling:
- Urgent events (safety, timeout) get priority
- Background reasoning (consolidation, planning) runs at lower priority
- Token/cost budgets per brain (limit LLM spend)

##### 5.2.5 Implementation Language

The native runtime would be implemented in **Rust** or **C** with:
- .NET interop via NativeAOT or P/Invoke
- C API for other language bindings (Python, Go, C++)
- WASM host for sandboxed neuron execution

Synion.Runtime (.NET) becomes a managed wrapper over Synion.Native, preserving the existing C# API.

---

#### 5.3 Relationship to Protocol Layers

The native runtime sits beneath the protocol stack defined in Phase 0:

- **JSON Schema** (Phase 0) remains the canonical spec for all cognitive primitives
- **MCP** (Phase 2) remains the primary interface for LLM management
- **A2A** (Phase 3) remains the multi-agent interop layer
- **Protobuf** (Phase 5) is an internal optimization for the native event bus only
- External consumers never need to know protobuf exists

This follows the model of:
- HTTP (protocol) → Apache, Nginx, Kestrel (implementations with internal optimizations)
- SQL (protocol) → PostgreSQL (wire protocol is text, internal storage is binary)
- CloudEvents (protocol, JSON) → various SDKs with internal binary representations

UAP defines the **cognitive protocol in JSON**. Synion is the reference runtime that implements it. The native runtime optimizes the internal path without changing the external contract.

---

## Summary

Synion is not:
- a chatbot
- an LLM wrapper
- a workflow engine

Synion is:
- **a cognitive runtime where systems think in response to events and act through commands**
- **the operating system for AI agents built on DDD, CQRS, and event sourcing**
- **an MCP-native runtime — any LLM can manage, observe, and interact with Synion agents**
- **A2A-compatible — Synion brains interoperate with the broader agent ecosystem**
- **the reference implementation of UAP (Universal Agent Protocol) — a protocol for agent interoperability across software and physical systems**

The path from protocol to runtime to ecosystem:

Phase 0: UAP spec (JSON Schema) — define the cognitive primitives
Phase 1: Kernel abstractions (C# derived from spec) — implement the semantic model
Phase 2: Runtime + MCP server — make it run, make it LLM-manageable
Phase 3: Agent OS capabilities (planning, tools, A2A multi-agent) — make it smart
Phase 4: Ecosystem (packages, templates, UAP conformance tests) — make it adoptable
Phase 5: Native runtime (Rust/C, WASM sandbox, UAP protobuf binding) — make it fast
