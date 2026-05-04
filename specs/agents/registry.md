# Global OAP Registry *(future)*

> **Note:** This document describes a future concept — a public global directory of OAP-compliant endpoints. It is **not** a protocol capability that implementations need to support. No endpoints are defined here.

A recurring question is: "I've implemented OAP — how do people find me?"

OAP's self-describing discovery mechanism (`/.well-known/oap`) solves the *interaction* problem — once a caller knows your endpoint URL, they can discover everything. But it does not solve the *discoverability* problem — how does a caller find your URL in the first place?

## The Problem

A global OAP registry would be a public, community-operated directory where anyone who has implemented OAP can list their endpoint:

- **Implementer** publishes their OAP endpoint URL to the registry
- **Caller** searches the registry by capability, domain, or name
- **Registry** returns the endpoint URL(s) — the caller then hits `/.well-known/oap` and proceeds normally

This is conceptually similar to npm (packages), Docker Hub (images), or the WebFinger protocol — a well-known public listing, not part of the core protocol itself.

## Why It Is Not Part of the Core Spec

- **Not required for compliance** — two OAP-compliant services can interoperate perfectly without any registry
- **Governance concerns** — a public registry requires moderation, abuse prevention, availability guarantees, and funding — none of which belong in a protocol spec
- **Out-of-band discovery is common** — callers typically know their target service URLs via configuration, environment variables, or manual setup; a registry is a convenience layer

## Webhook Subscriptions

The previous version of this document described `POST /services` as a way to register webhook callbacks. Webhook subscription has been moved to the `agents.events` capability — see [`POST /subscriptions`](events.md#webhook-rest-http-clients-optional).

## Future

If and when a public OAP registry is operated, it will be described here with its own endpoint URL, submission process, and discovery API. The registry itself would expose a standard OAP manifest and comply with the protocol — making it self-describing and agent-navigable.

