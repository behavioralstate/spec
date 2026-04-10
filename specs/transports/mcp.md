# MCP Transport

**Version:** 2026-04-10

MCP (Model Context Protocol) allows any LLM client to manage agents directly.

## Mapping

| OAP Concept | MCP Concept |
|---|---|
| Agent descriptors | MCP resources (list, read state) |
| Agent management | MCP tools (register, remove, pause, resume) |
| Event delivery | MCP tools |
| Command observation | MCP tools |
| Execution traces | MCP resources |

## Result

Any LLM client (ChatGPT, Copilot, Gemini, Claude, Ollama) becomes a management UI for OAP agents.

## Transport Configuration

```json
"mcp": {
  "transport": "stdio",
  "server": "oap-mcp"
}
```

MCP transport is **optional** — REST is the baseline. MCP is declared in the `/.well-known/oap` manifest only if the endpoint supports it.
