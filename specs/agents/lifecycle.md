# Service Lifecycle — `io.bsp.agents.lifecycle` *(removed)*

> **This capability has been removed from the BSP specification.** Together with [Registry](./registry.md), it has been absorbed into the core command, query, and event primitives.

The lifecycle capability defined bespoke control endpoints — `POST /services/{id}/pause`, `POST /services/{id}/resume`, `POST /services/{id}/heartbeat` — for operating on a registered service. Like the registry, these are resource-shaped management operations, not part of the command/event interaction surface.

Pausing, resuming, and heart-beating a service are domain operations on the meta-domain of "the fleet." They are expressed with the same primitives as any other operation: commands in, events out.

## Where the pieces went

| Removed lifecycle endpoint | Express it instead as |
|---|---|
| `POST /services/{id}/pause` | a `PauseService` command → `ServicePausedV1` event |
| `POST /services/{id}/resume` | a `ResumeService` command → `ServiceResumedV1` event |
| `POST /services/{id}/heartbeat` | a `Heartbeat` command; a missed heartbeat → `ServiceErroredV1` event |
| service `status` (`running` / `paused` / `error`) | carried on the service descriptor in the manifest's `agents` array, and changed via the events above |

See [Composing Commands into Processes — a service registry with heartbeat](../composing-processes.md#worked-example-a-service-registry-with-heartbeat) for the worked example (including pause/resume and heartbeat), and [Design Decisions — Registry and Lifecycle removed](../design-decisions.md#registry-and-lifecycle-removed) for the rationale.
