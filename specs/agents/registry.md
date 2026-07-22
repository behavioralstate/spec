# Service Registry — `io.best.agents.registry` *(removed)*

> **This capability has been removed from the BEST specification.** Together with [Lifecycle](./lifecycle.md), it has been absorbed into the core command, query, and event primitives.

The registry capability defined bespoke resource endpoints — `POST /services`, `GET /services`, `GET /services/{id}`, `DELETE /services/{id}` — for managing a directory of services. That was the one corner of BEST built on resource CRUD, the very model the protocol defines itself against (see [BEST vs REST](../comparisons/rest.md)).

Managing services is not a protocol concern. It is just another **domain**, and BEST already has everything needed to express a domain: commands go in, queries read current state, events come out. A dedicated capability added surface without adding capability.

## Where the pieces went

| Removed registry / lifecycle endpoint | Express it instead as |
|---|---|
| `POST /services` (register) | a `RegisterService` command → `ServiceRegisteredV1` event |
| `DELETE /services/{id}` (deregister) | a `DeregisterService` command → `ServiceDeregisteredV1` event |
| `POST /services/{id}/pause` · `…/resume` | a `PauseService` / `ResumeService` command → `ServicePausedV1` / `ServiceResumedV1` event |
| `POST /services/{id}/heartbeat` | a `Heartbeat` command (no event needed); a missed heartbeat → `ServiceErroredV1` |
| `GET /services` · `GET /services/{id}` (read) | a `list-services` / `get-service` query ([Queries](./queries.md)) |
| change notifications | the corresponding events on `GET /events` |

The **service descriptor** (`id`, `name`, `accepts`, `produces`, `status`, `metadata`, …) remains a normative concept. Its home has moved from the live registry to the discovery manifest's `agents` array — see [Discovery](../discovery.md#service-descriptor).

## Building a registry on core BEST

A registry is just a domain. For a complete, copy-ready vocabulary — the command names, the list/get queries, the heartbeat mechanism, and the events to subscribe to — see [Composing Commands into Processes — a service registry with heartbeat](../composing-processes.md#worked-example-a-service-registry-with-heartbeat).

See [Design Decisions — Registry and Lifecycle removed](../design-decisions.md#registry-and-lifecycle-removed) for the rationale, which parallels the earlier [removal of `io.best.agents.memory`](./memory.md).
