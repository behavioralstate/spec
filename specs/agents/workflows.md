# Workflows — `io.best.agents.workflows`

Workflows are **published recipes** — read-only, named sequences of catalogue operations with per-step guidance, for multi-step processes whose order is a fixed, well-known happy path. The capability is **strictly descriptive**: the service never executes, retries, tracks, or branches the steps. The caller — typically an LLM agent — sends each operation itself and waits for its outcome before proceeding. Optional capability, declared in the manifest like any other.

> Normative reference: [SPEC.md — Workflows](https://github.com/behavioralstate/spec/blob/main/SPEC.md#workflows--iobestagentsworkflows). Canonical schema: [workflows.json](../../protocol/v1/schemas/agents/workflows.json). For choosing between recipes and event-driven choreography, see [Composing Processes](../composing-processes.md).

The canonical use: an agent connects to a service, reads the command catalogue, and needs to run a process that takes five operations in a specific order with facts threaded between them. Without a recipe it reconstructs that choreography from raw schemas — and gets it subtly wrong. With one, it reads the steps and drives them.

| Capability | HTTP | Returns | Changes state? |
|---|---|---|---|
| `agents.commands` | `POST /commands` | `201` (async) | **Yes** |
| `agents.queries` | `GET /queries/{schema}` | Current state (sync) | No |
| `agents.workflows` | `GET /workflows` | Published recipes | **No** |

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/workflows` | Workflow index — `id`, `name`, `description` per recipe, **never the steps** |
| GET | `/workflows/{id}` | One full recipe with its ordered steps; `404` for an unknown id |

**Index** (`GET /workflows`) — deliberately shallow so a consumer can hold the entire list in one read and choose. Each entry: `id` (stable, service-defined, URL-path-safe — reverse-domain such as `io.example.workflows.onboard-a-worker`, or kebab-case), `name`, `description`. Renaming an id is a breaking change for anything linking to it.

**Recipe** (`GET /workflows/{id}`) — `id`, `name`, `description`, and the ordered `steps`. Each step:

| Field | Required | Description |
|---|---|---|
| `kind` | yes | `"command"` or `"query"` |
| `dataschema` | yes | Resolvable URI of the operation's schema document in this service's **live catalogue** — recipes reference the catalogue, never duplicate it, so they cannot drift from the real contracts |
| `optional` | no | `true` when the step applies only in some runs |
| `guidance` | no | How this step combines with the others — what to carry forward, what to wait for, when to skip. Anything about the single operation in isolation belongs in that operation's schema description instead. |

## Discoverability — linking from the catalogues

A command or query catalogue entry **may** carry a `workflows` array naming the workflow ids the operation participates in. Servers **should** populate it for every operation that appears in a recipe: the catalogue is the first thing an agent reads, and without the link a catalogue-first consumer never learns a recipe exists. Schema-document descriptions **should** additionally name the recipe where the prose has room.

```json
{
  "schema": "submit-employee",
  "version": "1.0",
  "dataschema": "https://api.example.com/commands/submit-employee/1.0",
  "description": "Create a worker engagement record.",
  "workflows": ["io.example.workflows.onboard-a-worker"]
}
```

## Usage pattern

```
GET /commands                                     → catalogue entry links a workflow id
GET /workflows                                    → index: pick the recipe by description
GET /workflows/io.example.workflows.onboard-a-worker  → the ordered steps
POST /commands · GET /queries/... per step        → the CALLER drives each one, in order
```

## What workflows are NOT

- **Not an execution engine** — the service never runs, retries, persists, or branches steps on the caller's behalf. The moment it does, it has built an execution runtime, which is out of BEST scope (put Temporal, Durable Functions, or similar *behind* the service).
- **Not a new operation surface** — every step references an operation that already exists in the command or query catalogue; a recipe introduces no new types.
- **Not a state machine** — a recipe is a linear happy path with optional steps. Branching, conditions, parallel fan-out, and compensation belong to [choreography](../composing-processes.md) or a real orchestrator.
- **Not required** — a service with no fixed multi-step processes simply omits the capability.

> **History:** before 0.9.4 this surface existed only as a vendor-extension convention (`/workflows` under an implementer-owned namespace). Existing publishers migrate by declaring the capability, splitting the old full-list response into index + per-id detail, and adopting the step shape above.
