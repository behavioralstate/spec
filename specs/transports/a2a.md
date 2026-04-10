# A2A Transport

**Version:** 2026-04-10

A2A (Google Agent-to-Agent) enables multi-agent coordination. Agents can expose themselves as A2A agents.

## Mapping

| A2A Concept | OAP Mapping |
|---|---|
| **Agent Card** | Agent descriptor |
| **Task** | An execution trace (agent processed an event) |
| **Message** | Event or Command |
| **Artifact** | Execution Trace |

## Transport Configuration

```json
"a2a": {
  "agent_card_url": "http://localhost:5100/.well-known/agent.json"
}
```

A2A transport is **optional** — REST is the baseline. A2A is declared in the `/.well-known/oap` manifest only if the endpoint supports it.
