# Workflows — `io.best.agents.workflows`

For choosing between recipes and event-driven choreography, see [Composing Processes](../composing-processes.md).

The canonical use: an agent connects to a service, reads the command catalogue, and needs to run a process that takes five operations in a specific order with facts threaded between them. Without a recipe it reconstructs that choreography from raw schemas — and gets it subtly wrong. With one, it reads the steps and drives them.

**From SPEC.md:** [Workflows](https://github.com/behavioralstate/spec/blob/main/SPEC.md#workflows--iobestagentsworkflows)

## Workflows beside the other capabilities

| Capability | HTTP | Returns | Changes state? |
|---|---|---|---|
| `agents.commands` | `POST /commands` | `201` (async) | **Yes** |
| `agents.queries` | `GET /queries/{schema}` | Current state (sync) | No |
| `agents.workflows` | `GET /workflows` | Published recipes | **No** |

## The cross-link, as it appears

**On the catalogue entry** (`GET /commands`, `GET /queries`):

```json
{
  "schema": "submit-employee",
  "version": "1.0",
  "dataschema": "https://api.example.com/commands/submit-employee/1.0",
  "description": "Create a worker engagement record.",
  "workflows": ["io.example.workflows.onboard-a-worker"]
}
```

**On the schema document** (`GET /commands/{schema}/{version}`, `GET /queries/{schema}/{version}`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "description": "Create a worker engagement record.",
  "type": "object",
  "properties": { "...": "..." },
  "workflows": ["io.example.workflows.onboard-a-worker"]
}
```

Deriving both from the recipe definitions themselves (rather than maintaining them by hand) keeps drift impossible.

## Usage pattern

```
GET /commands                                     → catalogue entry links a workflow id
GET /workflows                                    → index: pick the recipe by description
GET /workflows/io.example.workflows.onboard-a-worker  → the ordered steps
POST /commands · GET /queries/... per step        → the CALLER drives each one, in order
```
