---
###
# Internet-Draft skeleton for the BEST protocol, in kramdown-rfc format.
# Build: gem install kramdown-rfc && kdrfc draft-best-protocol-00.md
# Submit: https://datatracker.ietf.org/submit/ (free account), then email the
# Independent Submissions Editor per https://www.rfc-editor.org/about/independent/
#
# TODO before -00 submission:
#   - replace LASTNAME in `docname` with the author's surname (I-D naming convention)
#   - complete the sections marked [TODO: expand from SPEC.md]
#   - run a requirements-language pass: every MUST/SHOULD/MAY intentional, RFC 8174 style
###
title: "BEST: The Behavioral State Protocol"
abbrev: "BEST"
docname: draft-LASTNAME-best-protocol-00
category: info
submissiontype: independent
ipr: trust200902
area: ""
workgroup: ""
keyword:
  - CQRS
  - CloudEvents
  - discovery
  - agent interoperability
author:
  - name: Riccardo D.
    email: riccardo.d@xml-int.com
normative:
  RFC2119:
  RFC3986:
  RFC6570:
  RFC8174:
  RFC8615:
  CLOUDEVENTS:
    title: "CloudEvents - Version 1.0.2"
    author:
      - org: Cloud Native Computing Foundation
    target: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
  JSONSCHEMA:
    title: "JSON Schema: A Media Type for Describing JSON Documents (draft 2020-12)"
    target: https://json-schema.org/draft/2020-12/json-schema-core
informative:
  MCP:
    title: "Model Context Protocol"
    target: https://modelcontextprotocol.io/
  BESTSPEC:
    title: "BEST - Behavioral State Protocol (living specification)"
    target: https://behavioralstate.io/
---

--- abstract

The Behavioral State Protocol (BEST) defines a discovery-first, behaviour-oriented interaction surface for domain services: the commands a service accepts, the events it publishes, and optionally the queries it answers. Services self-describe through a manifest at the well-known URI "/.well-known/best"; messages use a conformant profile of the CloudEvents 1.0 envelope described by JSON Schema. BEST deliberately specifies only the interaction surface — never a service's internal architecture, storage, or execution model — allowing independent implementations across any runtime, language, or transport to interoperate without bespoke integration.

--- middle

# Introduction

Command Query Responsibility Segregation (CQRS) separates writes (commands) from reads (events and queries), but no common mechanism exists for a caller to discover what commands a service accepts, what events it produces, or how to interact with it, without reading bespoke documentation. BEST fills this gap with three elements: a well-known discovery manifest, a single command-ingestion entry point routed by message type, and a queryable event log.

[TODO: expand from SPEC.md "What BEST Is" and "Design Principles".]

## Conventions and Definitions

{::boilerplate bcp14-tagged}

Service:
: A BEST-compliant domain service that accepts commands and publishes events.

Command:
: An intent to change the system, sent to a service by any caller.

Event:
: An immutable domain fact published by a service as the result of processing.

Query:
: A synchronous read of current state (optional capability).

Manifest:
: The JSON document served at "/.well-known/best" describing a service's capabilities, transports, and authentication requirements.

# Message Envelope

BEST messages are CloudEvents {{CLOUDEVENTS}}: every valid BEST message is a valid CloudEvents 1.0 message. BEST is a profile that restricts the envelope as follows: the "type" attribute MUST be PascalCase; "datacontenttype" MUST be "application/json"; "dataschema" MUST be present on commands (it MAY be absent on events, which are then untyped); consumers MUST ignore unknown envelope attributes rather than reject messages carrying them.

[TODO: envelope field table and examples from SPEC.md "Wire Format".]

# Discovery

Every BEST endpoint serves a manifest at the well-known URI "/.well-known/best" ({{RFC8615}}) with media type "application/json", over HTTPS. This resource MUST be retrievable without authentication; every other endpoint MAY require the credentials declared in the manifest's "authentication" object.

[TODO: manifest structure, capability entries, endpoints arrays, push channels, from SPEC.md "Discovery".]

## Multi-Tenancy

A multi-tenant host declares an RFC 6570 {{RFC6570}} URI template in "tenants.manifest"; "tenantId" is the only permitted variable. The expanded URI returns a fully self-contained tenant manifest.

[TODO: root-manifest rules from SPEC.md "Multi-Tenancy".]

# Commands

[TODO: catalogue, ingestion semantics (201 semantics, idempotency by "id", routing by "type"), schema documents, correlation, from SPEC.md "Commands".]

# Events

[TODO: historical query, SSE stream, subscriptions/webhooks, typed vs untyped, from SPEC.md "Events".]

# Queries

[TODO: catalogue, schema documents, execution, from SPEC.md "Queries".]

# Transports

HTTP is the baseline transport that every conformant service exposes. A Model Context Protocol {{MCP}} binding MAY additionally be declared for LLM tooling. All transports expose the same logical capability surface.

[TODO: path resolution, error format, status codes, from SPEC.md "HTTP Transport" / "MCP Transport".]

# Conformance

[TODO: minimal-compliance checklist and per-capability required endpoints from SPEC.md "Conformance". Note explicitly: no new IANA registries are established by this document.]

# Implementation Status

RFC 7942 note: this section records known implementations at the time of writing and is to be removed by the RFC Editor before publication.

Two independent production deployments of BEST exist: dotquant.io (fintech trading platform) and remundo.com (business platform), each exposing discovery, commands, events, and queries over the HTTP binding. A generic reference MCP server (@behavioralstate/best-mcp, npm) adapts any BEST endpoint for MCP-capable LLM clients.

# Security Considerations

[TODO: adapt SPEC.md "Security Requirements" in full — TLS; single unauthenticated endpoint; dataschema SSRF (servers MUST NOT fetch caller-supplied dataschema URIs); replay protection via "id" idempotency; "source" never treated as authenticated identity; webhook SSRF validation incl. DNS-rebinding re-validation; tenant isolation derived from authenticated identity; input limits; manifest content hygiene; credential passthrough at intermediaries.]

# IANA Considerations

IANA is requested to update the existing provisional registration of the "best" well-known URI suffix in the "Well-Known URIs" registry {{RFC8615}} to permanent, with this document as the specification reference:

URI suffix:
: best

Change controller:
: [author]

Specification document:
: this document

Status:
: permanent

This document establishes no new registries.

--- back

# Acknowledgments
{:numbered="false"}

[TODO.]
