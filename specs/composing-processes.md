# Composing Commands into Processes

> **This is a non-normative guide.** It describes *patterns* for combining BEST
> commands and events into multi-step business processes. It defines no new
> capability, no required endpoint, and no wire format — the workflows capability
> referenced by Pattern 2 is normatively defined on
> [its own page](./agents/workflows.md). Nothing here is needed for conformance —
> see [Conformance](./conformance.md) for what is.

BEST gives you the primitives for a single interaction: send a command, observe
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

The single most important decision is *who drives the sequence*. BEST supports
two answers, and they are not mutually exclusive.

| Pattern | Who decides the next step | What the service exposes |
|---|---|---|
| **Choreography** | The caller reacts to each event and sends the next command | Nothing extra — just commands and events |
| **Published workflows** | The caller still drives, but follows a published recipe | The optional, read-only [workflows capability](./agents/workflows.md) |

Neither pattern lets the *service* run the workflow for you. In both, the caller
(an application, a Process Manager, an AI agent) sends each command and waits for
the resulting fact before proceeding. The difference is only whether the ordering
is discovered from a published recipe or known to the caller in advance.

## Pattern 1 — Choreography (events drive the sequence)

This is the default, and it requires nothing beyond the core capabilities. The
caller sends a command, observes the event it produces, and uses that fact to
decide — and parameterise — the next command. The thread that ties the steps
together is the **`correlationid`** envelope attribute: established by the first
command (supplied by the caller, or defaulting to that command's `id`), stamped
on every resulting event, and propagated onto each follow-up command
([Commands — Correlation](./agents/commands.md)).

```
SubmitUser             → UserSubmittedV1
ConfigureSubscription  → SubscriptionConfiguredV1     ← sent on UserSubmittedV1
AssignRoles            → RolesAssignedV1              ← sent on SubscriptionConfiguredV1
                       → UserOnboardedV1              ← terminal fact
```

The first command establishes the correlation id for the whole process:

```json
POST /commands
{
  "specversion": "1.0",
  "id": "11111111-1111-1111-1111-111111111111",
  "source": "https://pm.example.com/onboarding",
  "type": "SubmitUser",
  "datacontenttype": "application/json",
  "dataschema": "submit-user/1.0",
  "correlationid": "XCSFIFR04763087",
  "time": "2025-07-01T10:30:00Z",
  "data": { "email": "ada@example.com" }
}
→ 201 { "id": "11111111-1111-1111-1111-111111111111", "correlationId": "XCSFIFR04763087" }
```

Every event these commands produce carries `correlationid: "XCSFIFR04763087"` on
its envelope, and each follow-up command propagates it — alongside the domain
identifiers established by earlier events (here, the worker id surfaced on
`UserSubmittedV1`). The whole process is then observable as a log of facts:

```
GET /events?correlationId=XCSFIFR04763087
  → UserSubmittedV1
  → SubscriptionConfiguredV1
  → RolesAssignedV1
  → UserOnboardedV1
```

To avoid polling, the caller can subscribe to a push channel (SSE stream or MCP
notification) and react the moment each event is published — see
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

## Pattern 2 — Published workflows (`io.best.agents.workflows`)

Sometimes the steps are a fixed, well-known recipe — a linear happy path a caller
should follow in order. Rather than make every caller rediscover that order, a
service can **publish it as read-only metadata** through the optional
[workflows capability](./agents/workflows.md): a shallow index at
`GET /workflows` (id, name, description per recipe — small enough for an agent
to hold in one read) and one full recipe with its ordered steps at
`GET /workflows/{id}` (this is what the `best-mcp` `get_workflows` tool reads).

This is purely descriptive. It is a *hint*, not an engine: the caller still sends
each command and waits for its `201` before the next. The service neither
executes nor tracks the sequence.

```json
GET /workflows/io.example.workflows.onboard-a-worker
{
  "id": "io.example.workflows.onboard-a-worker",
  "name": "Onboard a worker",
  "description": "Onboard a new worker. Execute steps in order, waiting for each outcome before proceeding.",
  "steps": [
    { "kind": "command", "dataschema": "https://api.example.com/commands/submit-employee/1.0",
      "guidance": "Create the engagement record. Keep the correlationId — later steps reference it." },
    { "kind": "command", "dataschema": "https://api.example.com/commands/add-point-of-contact/1.0",
      "guidance": "Assign a point of contact, using the id established in step 1." },
    { "kind": "command", "dataschema": "https://api.example.com/commands/invite-worker/1.0",
      "optional": true, "guidance": "Send the onboarding invitation, when the user wants it sent immediately." }
  ]
}
```

Each step's `dataschema` references an operation that already exists in the
command or query catalogue
([Commands — the catalogue](./agents/commands.md#the-catalogue-get-commands)).
The recipe adds ordering and intent on top of operations the service already
accepts; it introduces no new command types — and because it links the live
catalogue instead of duplicating it, it cannot drift from the real contracts.

> **Make the recipes discoverable.** The protocol defines exactly one mechanism
> for it: the `workflows` cross-link array, carried on an operation's catalogue
> entry AND its schema document, naming the recipes the operation participates
> in. Servers **should** stamp it for every operation that appears in a recipe;
> consumers **should** read the recipe before composing the sequence themselves.
> Without the link, a catalogue-first consumer reconstructs the choreography
> from raw schemas, never learning a recipe exists — and prose mentions carry
> no discoverability role. (Before 0.9.4 this surface was a vendor-extension
> convention under implementer-owned namespaces; see the
> [capability page](./agents/workflows.md) for the migration note.)

### Keep it descriptive

The workflows capability stays on the right side of the protocol's scope
boundary **only while it remains a flat, read-only description**. The moment a
service starts executing the steps for the caller, retrying them, persisting
run state, or branching on conditions, it has built an execution runtime — which
is explicitly out of scope ([Overview](./overview.md#protocol-scope)). That is a
legitimate thing to build; it just is not BEST, and it does not belong behind
the workflows capability.

| Stays descriptive (fine) | Becomes a runtime (out of scope) |
|---|---|
| Lists steps and their order | Executes the steps on the caller's behalf |
| Names the command schema per step | Retries or schedules failed steps |
| Explains how to thread ids between steps | Persists per-run workflow state |
| Linear happy path | Branching, conditions, parallel fan-out, compensation |

If you need branching, parallelism, or durable execution, reach for a real
orchestration engine (Temporal, Durable Functions, an actor runtime) *behind*
your service. BEST describes the commands it accepts and the events it emits; the
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

## Worked example: a service registry with heartbeat

A registry — a live directory of the services running behind an endpoint — is a
common need, and a good test of the claim that **service management is just a
domain**. Here it is, built entirely from core primitives: no bespoke `/services`
endpoints, everything through `/commands`, `/queries`, and `/events`.

**Commands** (`POST /commands`) — each carries a service descriptor or id in `data`:

| Command | Emits | Purpose |
|---|---|---|
| `RegisterService` | `ServiceRegisteredV1` | Add or replace a service (upsert by `id`) |
| `DeregisterService` | `ServiceDeregisteredV1` | Remove a service |
| `PauseService` / `ResumeService` | `ServicePausedV1` / `ServiceResumedV1` | Toggle availability |
| `Heartbeat` | — | Liveness ping (see below) |

The `RegisterService` `data` payload **is** the
[service descriptor](./discovery.md#service-descriptor): `id`, `name`, `accepts`,
`produces`, `status`, optional `metadata`.

**Queries** (`GET /queries`) — the read side:

```
GET /queries/list-services           → all descriptors
GET /queries/get-service?id=pricing  → one descriptor
```

**Events** (`GET /events`, or a push channel) — react to fleet changes:

```
GET /events?type=ServiceRegisteredV1
GET /events?type=ServiceErroredV1
```

**Heartbeat.** Each service periodically sends a `Heartbeat` command. The registry
tracks last-seen; when a service misses its window, the registry emits
`ServiceErroredV1` and sets the descriptor `status` to `error`. Consumers learn of
dead services by subscribing to that event — no polling, and nothing the protocol
had to add.

Register a service:

```json
POST /commands
{
  "type": "RegisterService",
  "source": "https://pricing.example.com",
  "dataschema": "register-service/1.0",
  "data": {
    "id": "pricing",
    "name": "Dynamic Pricing",
    "accepts": ["AdjustPrice"],
    "produces": ["PriceAdjusted"],
    "status": "running"
  }
}
→ 201 { "id": "…" }   →  ServiceRegisteredV1
```

That is a complete registry — register, list, pause, expire — with not one
resource path. It is the recommended naming vocabulary, not a required capability:
there is no `io.best.*` registry namespace.

## See also

- [Commands](./agents/commands.md) — command catalogue, correlation, `produces`
- [Events](./agents/events.md) — the observable fact log and push channels
- [Overview — Protocol Scope](./overview.md#protocol-scope) — what BEST owns and does not
- [BEST vs REST](./comparisons/rest.md) — why behaviour-oriented composition differs from a CRUD chain
