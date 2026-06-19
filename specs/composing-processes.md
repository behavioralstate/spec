# Composing Commands into Processes

> **This is a non-normative guide.** It describes *patterns* for combining BSP
> commands and events into multi-step business processes. It defines no new
> capability, no required endpoint, and no wire format. Nothing here is needed
> for conformance — see [Conformance](./conformance.md) for what is.

BSP gives you the primitives for a single interaction: send a command, observe
the events it produces. Real systems rarely stop there. Onboarding a user,
fulfilling an order, or settling a trade is a *sequence* of commands, where each
step often depends on a fact established by the previous one.

The protocol deliberately does **not** own how those steps are sequenced.
Workflow graphs, durable execution, retries, and checkpointing are execution
runtime concerns, not protocol concerns
([Overview — Capability Tiers](./overview.md#capability-tiers-core-vs-extended-vs-out-of-scope)).
What the protocol *does* give you — commands, events, correlation, and push
channels — is enough to compose processes cleanly. This guide shows the two
patterns that fall out of those primitives, and where the line to the execution
runtime sits.

## Where the orchestration lives

The single most important decision is *who drives the sequence*. BSP supports
two answers, and they are not mutually exclusive.

| Pattern | Who decides the next step | What the service exposes |
|---|---|---|
| **Choreography** | The caller reacts to each event and sends the next command | Nothing extra — just commands and events |
| **Descriptive sequence** | The caller still drives, but follows a published recipe | An optional, read-only list describing the steps |

Neither pattern lets the *service* run the workflow for you. In both, the caller
(an application, a Process Manager, an AI agent) sends each command and waits for
the resulting fact before proceeding. The difference is only whether the ordering
is discovered from a published recipe or known to the caller in advance.

## Pattern 1 — Choreography (events drive the sequence)

This is the default, and it requires nothing beyond the core capabilities. The
caller sends a command, observes the event it produces, and uses that fact to
decide — and parameterise — the next command. The thread that ties the steps
together is the **correlation id** returned from the first command
([Commands — Correlation](./agents/commands.md)).

```
SubmitUser             → UserSubmittedV1
ConfigureSubscription  → SubscriptionConfiguredV1     ← sent on UserSubmittedV1
AssignRoles            → RolesAssignedV1              ← sent on SubscriptionConfiguredV1
                       → UserOnboardedV1              ← terminal fact
```

The first command returns the correlation id for the whole process:

```json
POST /commands
{
  "specversion": "1.0",
  "id": "11111111-1111-1111-1111-111111111111",
  "source": "https://pm.example.com/onboarding",
  "type": "SubmitUser",
  "datacontenttype": "application/json",
  "dataschema": "submit-user/1.0",
  "time": "2025-07-01T10:30:00Z",
  "data": { "email": "ada@example.com" }
}
→ 201 { "id": "XCSFIFR04763087" }
```

Each follow-up command carries identifiers established by earlier events (here,
the worker id surfaced on `UserSubmittedV1`), so the service can stitch the steps
together. The whole process is then observable as a log of facts:

```
GET /events?correlationId=XCSFIFR04763087
  → UserSubmittedV1
  → SubscriptionConfiguredV1
  → RolesAssignedV1
  → UserOnboardedV1
```

To avoid polling, the caller can subscribe to a push channel (webhook, MCP
notification, or A2A message) and react the moment each event is published — see
[Design Decisions — Polling vs push](./design-decisions.md#polling-vs-push).

> **Make the next step discoverable.** A command schema may declare the events it
> raises via the optional `produces` field
> ([Commands — produces](./agents/commands.md)).
> A caller (or an LLM agent) can read `produces` to learn which fact to wait for
> before sending the next command, without hard-coding the chain.

### When choreography is the right fit

- The steps belong to different callers or services.
- A step's outcome can branch the process (success vs. a `…Failed` event).
- You want the process to be reactive and loosely coupled.

## Pattern 2 — Descriptive sequence (a published recipe)

Sometimes the steps are a fixed, well-known recipe — a linear happy path a caller
should follow in order. Rather than make every caller rediscover that order, a
service can **publish it as read-only metadata**: a named list of command schemas
with an order and a human description of each step.

This is purely descriptive. It is a *hint*, not an engine: the caller still sends
each command and waits for its `201` before the next. The service neither
executes nor tracks the sequence.

A representative response shape:

```json
GET /workflows
{
  "workflows": [
    {
      "name": "worker-onboarding",
      "description": "Onboard a new worker. Execute steps in order, waiting for a 201 before proceeding.",
      "steps": [
        { "order": 1, "schema": "submit-employee",      "description": "Create the engagement record. Note the returned id." },
        { "order": 2, "schema": "add-point-of-contact", "description": "Assign a point of contact, using the id from step 1." },
        { "order": 3, "schema": "invite-worker",        "description": "Send the onboarding invitation, using the id from step 1." }
      ]
    }
  ]
}
```

Each step references a `schema` that already exists in the command catalogue
([Commands — GET /commands](./agents/commands.md#get-commands-command-catalogue)).
The recipe adds ordering and intent on top of commands the service already
accepts; it introduces no new command types.

> **This is a vendor extension, not a core capability.** BSP does not define a
> `/workflows` endpoint or a workflow capability. A service offering this must
> declare it under its **own** namespace (e.g. `io.acme.workflows`) in the
> discovery manifest — never under the reserved `io.bsp.*` namespace
> ([Discovery](./discovery.md)) — so that generic consumers can ignore what they
> do not understand and extension-aware consumers can opt in.

### Keep it descriptive

The descriptive-sequence pattern stays on the right side of the protocol's scope
boundary **only while it remains a flat, read-only description**. The moment a
service starts executing the steps for the caller, retrying them, persisting
run state, or branching on conditions, it has built an execution runtime — which
is explicitly out of scope ([Overview](./overview.md#protocol-scope)). That is a
legitimate thing to build; it just is not BSP, and it does not belong behind a
BSP capability.

| Stays descriptive (fine) | Becomes a runtime (out of scope) |
|---|---|
| Lists steps and their order | Executes the steps on the caller's behalf |
| Names the command schema per step | Retries or schedules failed steps |
| Explains how to thread ids between steps | Persists per-run workflow state |
| Linear happy path | Branching, conditions, parallel fan-out, compensation |

If you need branching, parallelism, or durable execution, reach for a real
orchestration engine (Temporal, Durable Functions, an actor runtime) *behind*
your service. BSP describes the commands it accepts and the events it emits; the
engine drives them.

## Choosing between the two

| If… | Prefer |
|---|---|
| Steps are reactive, branch, or span services | Choreography (Pattern 1) |
| Steps are a fixed linear recipe callers repeat | Descriptive sequence (Pattern 2) |
| You want zero extra surface | Choreography (Pattern 1) |
| You want to guide LLM agents through a known process | Either — `produces` for Pattern 1, a published recipe for Pattern 2 |

Both patterns share the same backbone: named commands in, observable facts out,
tied together by a correlation id. The process is something the caller composes
from those facts — not something the protocol runs.

## See also

- [Commands](./agents/commands.md) — command catalogue, correlation, `produces`
- [Events](./agents/events.md) — the observable fact log and push channels
- [Overview — Protocol Scope](./overview.md#protocol-scope) — what BSP owns and does not
- [BSP vs REST](./comparisons/rest.md) — why behaviour-oriented composition differs from a CRUD chain
