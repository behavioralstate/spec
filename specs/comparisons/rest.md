# BEST vs REST — Comparison

REST (Representational State Transfer) and BEST (Behavioral State Protocol) both use HTTP as a transport, but they answer fundamentally different questions. REST asks *"what resources exist and how do I manipulate them?"* BEST asks *"what operations does this service support, and what facts does it emit when those operations complete?"*

BEST is not limited to AI agents. It is a general-purpose protocol for exposing any service's capabilities — internal backends, microservices, third-party integrations — in a way that is **behaviour-oriented by design**. That design choice has two consequences: it drives the service implementation toward sound architectural patterns (DDD, CQRS, Event Sourcing), and it makes the surface naturally consumable by AI agents, which can reason far more effectively about named operations and observable facts than about resource URLs and status-field patches.

The distinction matters enormously for how you design, decompose, and evolve a system.

## The Core Difference: Resources vs Behaviour

REST is built on the concept of **resources** — things that exist and can be created, read, updated, or deleted. Every URL is a noun. Every interaction is one of four verbs: `GET`, `POST`, `PUT`/`PATCH`, `DELETE`. The architecture is fundamentally CRUD-oriented, and when you apply it to a real domain you quickly find yourself translating rich business behaviour into awkward resource mutations.

BEST is built on the concept of **capabilities** — things an agent can *do* and *observe*. Interactions are expressed as **commands** (instructions to change state) and **events** (facts about what happened). The protocol is explicitly behaviour-oriented, and that aligns naturally with how business processes actually work.

Consider a contract being signed:

| Approach | Shape |
|---|---|
| REST | `PATCH /contracts/123` with `{ "status": "signed" }` |
| BEST | `SignContract` command → `ContractSignedV1` event |

The REST approach tells you *what changed*. The BEST approach tells you *what happened and why*. That difference compounds across an entire system.

### Routing by URL vs routing by intent

The clearest way to see this difference is to onboard a user. In REST, each
operation is a `POST` to a different **resource path**; the caller has to know
each path and thread the new id into the next URL:

```
REST — many resource paths, routed by URL + verb
POST /users
POST /users/u_8f3a/subscription
POST /users/u_8f3a/roles
```

In BEST, every operation is a `POST` to the **same** entry point — `/commands` —
and the operation is named *in the message* (`type`), not in the URL. The id
rides inside `data`, so the path never changes:

```
BEST — one entry point, routed by the intent in the message
POST /commands   { "type": "SubmitUser",            "data": { ... } }
POST /commands   { "type": "ConfigureSubscription", "data": { ... } }
POST /commands   { "type": "AssignRoles",           "data": { ... } }
```

Note what is *not* different: the HTTP verb is `POST` on both sides, and the
number of calls is the same. BEST does not magically need fewer round-trips. The
difference is **where the operation lives** — REST encodes it in the URL and verb;
BEST carries it as a named intent through a single ingestion endpoint
([Commands — POST /commands](../agents/commands.md#post-commands-command-ingestion)).
The consequence is that REST consumers must construct resource-shaped paths from
prior knowledge, while BEST consumers send every command to one place and let the
`type` field do the routing.

## API Design Gravity

Because REST normalises everything into CRUD resources, teams building REST APIs tend to produce:

- **Anemic domain models** — rich business logic pushed into services rather than expressed in the API shape
- **Implicit state machines** — transitions encoded as status-field patches, with no explicit contract for which transitions are valid
- **Chatty integration** — consumers must poll or subscribe out-of-band to detect state changes
- **Version sprawl** — adding a new business action requires either a new status value or a new `action` envelope field that breaks the resource metaphor

BEST's command/event vocabulary makes the business operations *the API surface*. Adding a new operation is adding a new command type. Removing one is deprecating a command type. The API shape mirrors the domain language rather than the database schema.

## Alignment with DDD, CQRS, and Event Sourcing

BEST is a natural fit for systems that apply **Domain-Driven Design** principles:

### Domain-Driven Design

DDD centres on a **Ubiquitous Language** — a shared vocabulary between domain experts and developers. BEST commands and events carry that language directly in their `type` field (`SubmitTimesheet`, `TimesheetApprovedV1`). REST resources (`/timesheets/123`) do not.

### CQRS (Command Query Responsibility Segregation)

CQRS separates write operations (commands) from read operations (queries). BEST has this separation built into the protocol:

- `POST /commands` — the write path
- `GET /queries` — the read path  
- `GET /events` — the observable log

In REST, reads and writes share the same resource endpoints. CQRS must be bolted on as an architectural convention that is invisible at the API boundary.

### Event Sourcing

Event sourcing treats the event log as the system of record. BEST's `GET /events` endpoint exposes exactly this log — queryable by type, source, time range, and correlation. Consumers can replay events to rebuild state, audit history, or drive projections.

REST has no equivalent primitive. Audit trails and event history are bespoke additions, not first-class protocol concerns.

## The Observable Log

One practical consequence of BEST's design is the built-in `GET /events` endpoint:

```
GET /events?type=ContractSignedV1&from=2025-01-01&limit=100
```

This gives any authorised consumer a queryable, paginated view of everything that has happened — across all correlations, all time, all sources. You can use it to:

- Build read models (projections) without direct database access
- Feed AI agents with factual history rather than synthetic prompts
- Drive process managers and sagas reactively
- Power audit and compliance views

A REST API could provide a similar endpoint, but it would be a bespoke design decision — not a structural guarantee of the protocol. Any consumer of a BEST-compliant service can assume `GET /events` exists and behaves consistently.

## Comparison Summary

| Dimension | REST | BEST |
|---|---|---|
| Fundamental unit | Resource (noun) | Command / Event (verb / fact) |
| API orientation | CRUD | Behaviour |
| Domain language | Implicit (URLs + status fields) | Explicit (`type` field carries domain terms) |
| Read/write separation | Convention | Built into the protocol |
| Event log | Bespoke / absent | First-class (`GET /events`) |
| State transitions | Encoded as patches | Expressed as named commands |
| DDD alignment | Requires significant discipline | Natural |
| CQRS alignment | Must be designed in | Structural |
| Event sourcing alignment | Bespoke | Protocol-native |
| Schema contract | OpenAPI (optional) | JSON Schema (required by spec) |

## When REST Still Makes Sense

BEST is not a replacement for every HTTP API. REST remains a pragmatic choice when:

- You are exposing a simple **configuration or reference data** store with no meaningful business events
- Your consumers are browsers making direct CRUD calls to a data backend
- The domain genuinely is resource-shaped (e.g. file storage, key-value stores)

BEST is the right choice when your service implements any meaningful **business process**, when consumers need to react to **what happened** rather than poll for **what the current state is**, or when you want the protocol itself to enforce the discipline that CQRS and event sourcing require.
