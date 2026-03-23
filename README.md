# Synion

**Synion is an event-driven cognitive runtime for distributed systems.**

It provides a semantic and execution model where **brain units** process events, activate **neurons**, resolve context and memory, and produce **commands** that are executed by external actuators.

---

## 🧠 Motivation

Modern systems are increasingly:

- event-driven  
- distributed  
- stateful  
- augmented with AI  

However, most “agent frameworks”:
- are request/response oriented  
- hide decision-making inside opaque loops  
- are not aligned with DDD, CQRS, or event sourcing  

Synion takes a different approach.

It models cognition as a **continuous event → decision → action loop**, grounded in:

- **Domain-Driven Design (DDD)**  
- **CQRS and event sourcing**  
- **process managers / sagas**  
- **explicit command and event flows**  

---

## 🧩 Core Concepts

### Brain Unit

A **brain unit** is a bounded cognitive process manager responsible for a specific domain slice.

It:

- subscribes to relevant events  
- resolves domain state and memory  
- orchestrates neurons  
- emits commands  

Examples:
- negotiation brain  
- pricing brain  
- support escalation brain  

---

### Neuron

A **neuron** is a small, focused reasoning unit inside a brain.

It:

- evaluates a specific concern  
- may be deterministic or AI-powered  
- produces structured outcomes  

Examples:
- annual salary reasoning  
- start date reasoning  
- anomaly detection  

---

### Event

An **event** is an observed fact from the system.

Synion treats events as:

- immutable  
- externally produced  
- semantically opaque to the runtime  

Events are the **input to cognition**.

---

### Command

A **command** is an intent to change the system.

Synion:

- produces commands  
- does not execute them  

Commands are handled by external components (actuators), which then emit new events.

---

### Memory

Memory represents **brain-specific state** across time.

Examples:
- negotiation state  
- conversation context  
- workflow progress  

Memory is resolved and updated during execution, but remains external to the neuron itself.

---

## 🔄 Execution Model

Synion operates as a continuous loop:
Event → Brain Unit → Neurons → Commands → Actuators → Events


More explicitly:

1. An event is observed  
2. A brain unit determines if it should handle it  
3. Domain state and memory are resolved  
4. Relevant neurons are activated  
5. Neurons produce:
   - commands
   - memory updates
   - notes
6. Commands are sent to external systems  
7. External systems execute and emit new events  

---

## 🧱 Architecture Boundaries

Synion **does not own**:

- event transport  
- command transport  
- CloudEvents envelopes  
- domain models  
- actuator execution  

Synion **does own**:

- cognition semantics  
- execution flow  
- neuron orchestration  
- context resolution  
- memory interaction  
- command emission  

---

## ⚙️ Kernel (v1)

The Synion kernel defines a minimal set of abstractions.

### NeuroContext

```csharp
public sealed class NeuroContext
{
    public EventoMessage Event { get; init; } = null!;
    public object? DomainState { get; init; }
    public object? MemoryState { get; init; }
    public CancellationToken CancellationToken { get; init; }
}
```

### EventoMessage

```csharp
public sealed record EventoMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);
```

### CommandMessage

```csharp
public sealed record CommandMessage(
    string Type,
    object Data,
    IReadOnlyDictionary<string, string> Metadata);
```

### INeuron

```csharp
public interface IBrainDefinition
{
    string Name { get; }

    IReadOnlyCollection<string> SubscribedEventTypes { get; }

    Task<bool> CanHandleAsync(EventoMessage evt, CancellationToken ct = default);

    Task<object?> ResolveDomainStateAsync(EventoMessage evt, CancellationToken ct = default);

    Task<object?> ResolveMemoryAsync(
        EventoMessage evt,
        object domainState,
        CancellationToken ct = default);

    IReadOnlyCollection<INeuron> Neurons { get; }
}
```

### Integration Model

Synion is designed to integrate with existing systems.

### Events

Events can come from:
event stores
message brokers
logs
APIs
Commands

Synion produces commands which are:
wrapped (e.g. CloudEvents)
validated against schemas
sent to a queue
executed by actuators

Synion itself does not perform these steps.

### 🧠 AI Integration

AI is not the runtime — it is a capability inside neurons.
A neuron may:
call an LLM
use rules
combine both

Synion treats AI as:
pluggable
observable
constrained

### 🎯 Design Principles

Event-driven first
Explicit over implicit
Small composable units (neurons)
Domain boundaries respected (brain units)
Separation of cognition and actuation
AI as a tool, not the architecture

### 🚀 Goals

Synion aims to:
provide a reusable cognitive runtime
align AI systems with DDD and event sourcing
make decision-making explicit and observable
enable visual and configurable AI behavior (future)

### 📦 Status

Early-stage — defining the core semantic kernel.

### 🤝 Discussion

This repository is intended as:
a foundation for experimentation
a base for building domain-specific brains
a starting point for collaboration

### 🧭 Summary

Synion is not:
a chatbot
an LLM wrapper
a workflow engine

Synion is:
a cognitive runtime where systems think in response to events and act through commands.