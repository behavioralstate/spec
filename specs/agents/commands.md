# Commands — `io.best.agents.commands`

Commands are sent **to** the service by any caller — a Process Manager, an AI agent, a UI, or another service.

<div class="BEST-diagram">
  <div class="BEST-node">
    <div class="BEST-node-title">Caller</div>
    <div class="BEST-node-box">Any Caller</div>
    <div class="BEST-node-sub">app · agent · LLM</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">POST /commands</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">BEST Endpoint</div>
    <div class="BEST-node-box accent">Validates &amp; Queues</div>
    <div class="BEST-node-sub">201 Accepted (async)</div>
  </div>
  <div class="BEST-arrow">
    <div class="BEST-arrow-label">Async processing</div>
    <div class="BEST-arrow-track">→</div>
  </div>
  <div class="BEST-node">
    <div class="BEST-node-title">Service</div>
    <div class="BEST-node-box">Domain Handler</div>
    <div class="BEST-node-sub">processes · emits event</div>
  </div>
</div>

> **`POST /commands` is a behaviour endpoint, not a resource collection.** Sending a command is not creating a "command resource" — it is expressing an intent. `/commands` is a single entry point for every operation the service accepts; what happens is determined entirely by the envelope `type`, not the HTTP verb or the URL. In REST you manipulate resources; in BEST you invoke named operations and observe the facts they produce.

Commands ride the [CloudEvents 1.0 envelope](/specs/design-decisions#cloudevents-conformance) ([cloudEvent.json](../../protocol/v1/schemas/cloudEvent.json)) — see [SPEC.md — Wire Format](https://github.com/behavioralstate/spec/blob/main/SPEC.md#wire-format--the-best-envelope) for the field table and examples.

**From SPEC.md:** [Commands](https://github.com/behavioralstate/spec/blob/main/SPEC.md#commands--iobestagentscommands)

## Why results are retrieved this way

See [Design Decisions — Command Result Retrieval](/specs/design-decisions#command-result-retrieval).
