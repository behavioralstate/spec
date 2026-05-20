# Quick start with AI

The fastest way to get going with BSP is to paste one of these prompts into your AI assistant (GitHub Copilot, Claude, ChatGPT, or Cursor). Each prompt is designed to be copy-paste ready — fill in the parts in `[brackets]` and send it.

---

## Prompt 1 — Make your service BSP-compliant

Use this when you have an existing service and want to add a BSP surface to it.

```
Make my [ASP.NET Core / Express / FastAPI / Spring Boot] service BSP-compliant.

I need these four endpoints:
- GET /.well-known/bsp — discovery manifest
- GET /commands — catalogue listing accepted commands with JSON Schema
- POST /commands — CloudEvents 1.0 entry point
- GET /queries — query catalogue

Auth: X-Api-Key header. Set authentication.type = "apikey" in the manifest.

Spec reference: https://behavioralstate.io/docs
```

**What to expect:** The LLM will scaffold the four routes, a manifest class or JSON file, and a command handler stub. Review the generated `/.well-known/bsp` and ensure it includes the `authentication` block and at least one entry in `capabilities`.

---

## Prompt 2 — Configure bsp-mcp for your LLM client

Use this when your BSP service is running and you want to use it directly from your LLM client.

```
Configure bsp-mcp so I can use my BSP service from [VS Code Copilot / Claude Desktop / Cursor].

Service base URL: [https://api.example.com/bsp]
API key: [my-api-key]
Tenant ID: [my-tenant-id]  ← remove this line if not multi-tenant

Output the exact env vars and mcpServers JSON block to add to my client config.

bsp-mcp docs: https://behavioralstate.io/docs/transports/mcp
```

**What to expect:** The LLM will produce the `env` block and `mcpServers` JSON snippet. For VS Code you add it to `.vscode/mcp.json`; for Claude Desktop to `claude_desktop_config.json`; for Cursor to `cursor_mcp.json`. See [MCP transport](./transports/mcp.md) for full details.

---

## Prompt 3 — Validate your BSP endpoint

Use this when you have implemented BSP and want a second opinion before shipping.

```
Check that my BSP endpoint correctly implements the spec.

URL: [https://api.example.com]

Verify:
1. GET /.well-known/bsp — valid manifest, authentication block present
2. GET /commands — lists commands with schema, version, dataschema URI
3. POST /commands — accepts CloudEvents 1.0 (specversion, source, type, dataschema, data)
4. dataschema uses relative URI format: {name}/{version} (e.g. "submit-order/1.0")

Spec: https://behavioralstate.io/docs
```

**What to expect:** The LLM will walk through each endpoint, point out missing fields or incorrect formats, and suggest fixes. Common issues: `dataschema` set to an absolute URL instead of a relative URI, missing `authentication` block in the manifest, or command payload wrapped in an extra object rather than placed directly in CloudEvent `data`.

---

## Tips

- **Fill in `[brackets]`** before sending — the more context you give, the better the output.
- **Iterate** — after the LLM generates code, paste the result back and ask it to test against the spec or add missing error handling.
- **Use the playground** at [behavioralstate.io/playground](https://behavioralstate.io/playground) to inspect your live manifest and test commands interactively once the service is running.
