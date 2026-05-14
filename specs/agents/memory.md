# Service Memory — `io.oap.agents.memory` *(removed)*

> **This capability has been removed from the OAP specification.**

The `io.oap.agents.memory` capability has been removed. The use cases it was intended to cover are now better served by two existing parts of the protocol:

- **Static operational configuration** (model name, system prompt, provider settings): use the `metadata` field on the service descriptor — available on any registered service via `GET /services/{id}`.

- **Historical event log** (conversation history, audit trails, accumulated facts): use `GET /events` with the full filter set — `?type=`, `?source=`, `?from=`, `?to=`, `?correlationId=`, plus cursor-based pagination.

See [Service Descriptor Fields](registry.md#service-descriptor-fields) and [Events — Historical Query](events.md#get-events--historical-query) for the current specification.

See [Design Decisions — Service Metadata vs. Memory](../design-decisions.md#service-metadata-vs-memory) for the rationale.
