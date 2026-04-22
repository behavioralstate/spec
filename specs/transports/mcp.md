# MCP Transport

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

The `mcp` block in the service definition declares how to reach the MCP server:

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `transport` | string | yes | MCP transport type: `"stdio"`, `"sse"`, or `"http"` |
| `server` | string | yes | MCP server identifier or URL |
| `authentication` | object | no | Authentication requirements for connecting to this MCP server |

MCP transport is **optional** — REST is the baseline. MCP is declared in the `/.well-known/oap` manifest only if the endpoint supports it.

## Authentication

If the MCP server requires authentication, it declares this in an `authentication` block on the `mcp` transport object. Consumers — including AI agents and IDE tooling such as VS Code Copilot — **must** read this block to know what credentials to supply when connecting.

```json
"mcp": {
  "transport": "http",
  "server": "https://mcp.example.com/mcp",
  "authentication": {
    "type": "apiKey",
    "headers": [
      { "name": "X-Api-Key",   "description": "Your API key" },
      { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
    ],
    "docs": "https://docs.example.com/authentication"
  }
}
```

### Authentication Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | One of: `"none"`, `"bearer"`, `"apiKey"`, `"oauth2"` |
| `headers` | array | no | Required headers for `apiKey` type — use when more than one header is needed (e.g. both an API key and a tenant ID). For single-header API key auth, `headers` with one entry is preferred over `scheme` + `in`. |
| `scheme` | string | no | For `bearer`: the `Authorization` header prefix (e.g. `"Bearer"`) |
| `tokenUrl` | string | no | Token endpoint URL for `oauth2` or token-based flows |
| `scopes` | string[] | no | Required OAuth2 / token scopes |
| `docs` | string | no | URL to human-readable authentication documentation |

### Header Descriptor

Each entry in `headers` describes one required HTTP header:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | HTTP header name (e.g. `"X-Api-Key"`) |
| `description` | string | no | Human-readable description of what value to supply |
| `example` | string | no | Pre-filled example value. Tooling may use this to populate the header automatically — for instance, a per-tenant manifest may pre-fill the resolved tenant ID here so VS Code can generate a complete MCP server config without manual input. |

### Auth Type Examples

**API key — single header:**

```json
"authentication": {
  "type": "apiKey",
  "headers": [
    { "name": "X-Api-Key", "description": "Your API key" }
  ],
  "docs": "https://docs.example.com/auth"
}
```

**API key — multiple headers (e.g. key + tenant ID):**

```json
"authentication": {
  "type": "apiKey",
  "headers": [
    { "name": "X-Api-Key",   "description": "Your API key" },
    { "name": "X-Tenant-Id", "description": "Your tenant identifier", "example": "acme" }
  ],
  "docs": "https://docs.example.com/auth"
}
```

**Bearer token:**

```json
"authentication": {
  "type": "bearer",
  "scheme": "Bearer",
  "docs": "https://docs.example.com/auth"
}
```

**OAuth2:**

```json
"authentication": {
  "type": "oauth2",
  "tokenUrl": "https://auth.example.com/oauth2/token",
  "scopes": ["mcp:read", "mcp:write"],
  "docs": "https://docs.example.com/auth"
}
```

> **Tooling hint:** The `example` field on a header is intended for IDE tooling (e.g. VS Code Copilot's MCP server config). When consuming a per-tenant manifest, `example` values may be pre-filled so tooling can generate a ready-to-use MCP server config with no manual entry required.

> **MCP authentication vs. root authentication.** The root `authentication` block in the manifest describes credentials for the REST API. The `mcp.authentication` block describes credentials for the MCP server specifically. These may use the same mechanism or different ones — each transport declares its own requirements independently.
