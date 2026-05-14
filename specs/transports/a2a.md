# A2A Transport

A2A (Google Agent-to-Agent) enables multi-agent coordination. Agents can expose themselves as A2A agents.

## Mapping

| A2A Concept | BSP Mapping |
|---|---|
| **Agent Card** | Agent descriptor |
| **Task** | A command being processed |
| **Message** | Event or Command |

## Transport Configuration

```json
"a2a": {
  "agent_card_url": "https://your.compliant.BSP.endpoint/.well-known/agent.json"
}
```

A2A transport is **optional** — HTTP is the baseline. A2A is declared in the `/.well-known/bsp` manifest only if the endpoint supports it.
