# BEST vs UCP — Comparison

Google's **Universal Commerce Protocol (UCP)** and BEST share a common philosophy: define an open, discoverable interface so any agent can interact with any service without bespoke integrations. They differ in scope and in which problems they treat as protocol-level concerns.

## Where the Patterns Converge

### Discovery via `/.well-known/*`

Both protocols use the well-known URI convention as the canonical entry point. A consumer hits a single URL and learns everything it needs to begin interacting — no prior configuration required.

| Protocol | Discovery URL |
|---|---|
| BEST | `GET /.well-known/best` |
| UCP | `GET /.well-known/ucp` (or Google Merchant Center registration) |

In BEST the manifest declares services, transport bindings, capabilities, and authentication requirements. UCP's equivalent exposes merchant capabilities, pricing rules, and product catalogues.

### MCP as a Transport Option

Both protocols treat MCP (Model Context Protocol) as an optional transport layer, not the baseline. In BEST, MCP is declared in the `/.well-known/best` manifest under the `mcp` transport key:

```json
"mcp": {
  "transport": "stdio",
  "server": "best-mcp"
}
```

UCP uses the same approach: merchants can expose UCP capabilities via an MCP server, making them directly accessible to LLM clients (ChatGPT, Copilot, Gemini, Claude) without any additional plumbing.

### A2A Compatibility

UCP defines a mapping of shopping tasks (cart, checkout, fulfilment) to Google's Agent-to-Agent (A2A) task model. BEST does not define an A2A binding — an earlier draft did, but it was removed because it added spec surface without adding capability (see [Design Decisions — A2A transport removed](../design-decisions.md#a2a-transport-removed)). An A2A-speaking agent reaches a BEST service through the HTTP binding, which A2A itself rides on.

## Where BEST Diverges

### No Payment Primitive

UCP integrates with Google's **Agent Payments Protocol (AP2)** for secure, verified agent payments. This is a first-class protocol concern in UCP because commerce requires a trusted, auditable payment step before any fulfilment can occur.

BEST has **no payment primitive**. BEST is domain-agnostic — the same protocol works for a pricing engine, a code reviewer, a temperature sensor, or a contract negotiator. There is no concept of a verified purchase or an authorised charge at the protocol level.

**How to add payments on top of BEST:**

If you are building a commerce system on BEST, payments are modelled as regular events and commands:

```json
// Event sent to a payment agent
{
  "type": "PaymentRequested",
  "payload": {
    "orderId": "ord_123",
    "amount": { "value": "49.99", "currency": "USD" },
    "method": "card"
  }
}

// Command produced by the payment agent
{
  "type": "PaymentAuthorised",
  "payload": {
    "orderId": "ord_123",
    "transactionId": "txn_abc",
    "authorisedAt": "2025-07-01T12:00:00Z"
  }
}
```

The payment agent exposes its own `/.well-known/best` endpoint. Any other agent that needs to trigger a payment sends a `PaymentRequested` event to it and observes the resulting `PaymentAuthorised` or `PaymentDeclined` command. Whether the payment agent internally delegates to AP2, Stripe, or another system is an implementation detail invisible to the protocol.

### Authentication is Caller-Responsibility

UCP includes verified agent identity as part of the protocol — the AP2 layer ensures the calling agent is who it claims to be before authorising a transaction.

BEST delegates authentication entirely to the consumer. The `/.well-known/best` manifest declares what is required:

```json
"authentication": {
  "type": "bearer",
  "scheme": "Bearer",
  "scopes": ["BEST:read", "BEST:write"],
  "tokenUrl": "https://auth.example.com/oauth2/token",
  "docs": "https://docs.example.com/authentication"
}
```

The consumer reads this block, acquires a token from `tokenUrl`, and includes it on every subsequent request. BEST supports `bearer`, `apiKey`, and `oauth2` flows. The protocol does not mandate *how* the identity is verified — that is the responsibility of the authentication endpoint.

### Scope: Commerce vs General Interoperability

| Dimension | UCP | BEST |
|---|---|---|
| Domain | Agentic commerce | Any domain |
| Primary actor | Merchant / virtual sales associate | Any agent (human, AI, IoT, service) |
| Payment | Built-in (AP2) | Domain convention (events + commands) |
| Product catalogue | Core primitive | Not in scope |
| Transport | HTTP, MCP, A2A | HTTP (baseline), MCP |
| Discovery | `/.well-known/ucp` | `/.well-known/best` |
| Schema format | Protobuf / JSON | JSON Schema |

## Summary

BEST and UCP share the same architectural thinking — well-known discovery, an optional MCP transport, and schema-first contracts. The difference is intentional: UCP solves the specific problem of agentic commerce (including payments and merchant identity); BEST solves the general problem of agent interoperability across any domain. A commerce platform could implement BEST and model UCP-style interactions purely through the event/command vocabulary, deferring payment and identity concerns to the services that specialise in them.
