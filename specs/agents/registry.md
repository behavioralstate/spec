# Global BSP Registry *(future)*

> **Note:** This document describes a future concept — a public global directory of BSP-compliant endpoints. It is **not** a protocol capability that implementations need to support. No endpoints are defined here.

A recurring question is: "I've implemented BSP — how do people find me?"

BSP's self-describing discovery mechanism (`/.well-known/bsp`) solves the *interaction* problem — once a caller knows your endpoint URL, they can discover everything. But it does not solve the *discoverability* problem — how does a caller find your URL in the first place?

## The Problem

A global BSP registry would be a public, community-operated directory where anyone who has implemented BSP can list their endpoint:

- **Implementer** publishes their BSP endpoint URL to the registry
- **Caller** searches the registry by capability, domain, or name
- **Registry** returns the endpoint URL(s) — the caller then hits `/.well-known/bsp` and proceeds normally

This is conceptually similar to npm (packages), Docker Hub (images), or the WebFinger protocol — a well-known public listing, not part of the core protocol itself.

## Why It Is Not Part of the Core Spec

- **Not required for compliance** — two BSP-compliant services can interoperate perfectly without any registry
- **Governance concerns** — a public registry requires moderation, abuse prevention, availability guarantees, and funding — none of which belong in a protocol spec
- **Out-of-band discovery is common** — callers typically know their target service URLs via configuration, environment variables, or manual setup; a registry is a convenience layer

## Webhook Subscriptions

Webhook subscription (push event delivery) is part of the `agents.events` capability — see [`POST /subscriptions`](events.md#webhook-http-clients-optional).

## Local Service Registry — `io.bsp.agents.registry`

> **When to implement this:** Only if your BSP endpoint hosts multiple independent agent services that consumers need to enumerate at runtime. For a single-service endpoint, `/.well-known/bsp` is sufficient — the manifest already describes what the service accepts and produces. If you are exposing one service, skip this capability entirely.

While a global BSP registry is a future concept, the protocol defines a **local service registry** as a first-class capability (`io.bsp.agents.registry`). An BSP endpoint implementing this capability exposes:

| Method | Path | Description |
|---|---|---|
| GET | `/services` | List registered services |
| POST | `/services` | Register or update a service (**upsert** — if a service with the given `id` already exists its descriptor is fully replaced) |
| GET | `/services/{id}` | Get service detail |
| DELETE | `/services/{id}` | Deregister a service — also removes all subscriptions with a matching `serviceId` |

### Service Descriptor Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Globally unique service identifier |
| `name` | string | yes | Human-readable name |
| `description` | string | no | What this service does |
| `version` | string | no | Semver version of the running implementation (e.g. `"1.2.0"`). Allows consumers to know which version is live and supports gradual rollouts. |
| `type` | string | no | Service type classification (e.g. `negotiation-service`, `pricing-engine`) |
| `endpoint` | string (URI) | no | Base URL of the service's BSP surface. Consumers append `/.well-known/bsp` to discover transport bindings and then send commands via `POST /commands`. Omit if the service is not directly addressable. |
| `accepts` | string[] | yes | CloudEvent `type` strings (PascalCase) this service ingests — e.g. `["ProposeCounter", "AcceptContract"]` |
| `produces` | string[] | yes | CloudEvent `type` strings (PascalCase) this service publishes — e.g. `["CounterProposed", "ContractAccepted"]` |
| `status` | enum | yes (response only) | `running` \| `paused` \| `stopped` \| `error` |
| `webhook` | object | no | Inline webhook for push delivery — alternative to registering a separate subscription |
| `metadata` | object | no | Opaque, service-defined configuration object. The protocol does not prescribe its structure. Intended for operational settings such as AI model name, system prompt, provider configuration, or any other key/value pair the service needs to expose. Must not be used for command routing or event filtering — those are served by `accepts` and `produces`. |

> **`accepts` and `produces` string format**: both arrays contain CloudEvent `type` strings — PascalCase identifiers (e.g. `ProposeCounter`). The schema enforces the pattern `^[A-Z][a-zA-Z0-9]*$`. These are the same strings that appear in the `type` field on the CloudEvent wire format.

> **`endpoint` and invocation**: BSP does not define a special invocation model for registered services. Once a consumer has the `endpoint`, they interact with the service using the standard BSP command flow: fetch `{endpoint}/.well-known/bsp` → call `GET /commands` to browse the catalogue → send `POST /commands` with a CloudEvent.

See [registry.json](../../protocol/v1/schemas/agents/registry.json) for the full JSON Schema.

## Global Registry *(future)*

If and when a public BSP registry is operated, it will be described here with its own endpoint URL, submission process, and discovery API. The registry itself would expose a standard BSP manifest and comply with the protocol — making it self-describing and agent-navigable.
