# bsp-mcp

MCP server for any [BSP-compliant](https://behavioralstate.io) endpoint. Exposes the BSP command and query surface as MCP tools so any LLM client (ChatGPT Desktop, Claude Desktop, GitHub Copilot, Cursor) can discover and interact with an BSP service.

## Tools

| Tool | What it does |
|---|---|
| `get_command_catalogue` | List all commands this endpoint accepts |
| `get_command_schema` | Fetch the full JSON Schema for a command type — learn the exact fields required |
| `send_command` | Send a command (CloudEvent 1.0 envelope built automatically) |
| `send_command_and_wait` | Send a command then poll a query until a condition is met — use when you need to confirm processing before proceeding |
| `get_query_catalogue` | List all read queries this endpoint exposes |
| `get_query_schema` | Fetch the JSON Schema for a query — learn parameters and response shape |
| `execute_query` | Execute a query and return current state synchronously |

Intended LLM flow: `get_command_catalogue` → pick a command → `get_command_schema` → gather fields → `send_command`.

For commands that require existing IDs: `get_query_catalogue` → `get_query_schema` → `execute_query` to read current state first.

## Setup

### 1. Install and build

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure

Configure via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `BSP_ENDPOINT` | yes | — | Base URL of the BSP HTTP surface (see below) |
| `BSP_API_KEY` | yes* | — | Credential value (*not required when `BSP_AUTH_TYPE=none`) |
| `BSP_AUTH_TYPE` | no | `bearer` | `bearer` · `apikey` · `none` |
| `BSP_AUTH_HEADER` | no | `X-Api-Key` | Header name when `BSP_AUTH_TYPE=apikey` and `BSP_AUTH_IN=header` |
| `BSP_AUTH_IN` | no | `header` | `header` or `query` — where the key is sent when `BSP_AUTH_TYPE=apikey` |
| `BSP_AUTH_PARAM` | no | `apikey` | Query parameter name when `BSP_AUTH_IN=query` |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `MCP_HTTP_PORT` | no | `3000` | HTTP port when `MCP_TRANSPORT=http` |

`BSP_AUTH_TYPE` maps directly to the `authentication.type` field in `/.well-known/bsp`. Use `bearer` for OAuth2/JWT endpoints, `apikey` for custom-header or query-param API keys, `none` for public endpoints.

**`BSP_ENDPOINT`** should point at the root of the BSP HTTP surface — the base path from which `/commands`, `/queries`, etc. are resolved. Examples:

```
# Single-tenant BSP service — Bearer auth (default)
BSP_ENDPOINT=https://api.example.com/bsp

# Multi-tenant BSP service — tenant path scoped
BSP_ENDPOINT=https://api.example.com/bsp/tenants/<your-tenant-id>

# Service using a custom API key header
BSP_ENDPOINT=https://api.example.com/bsp
BSP_AUTH_TYPE=apikey
BSP_AUTH_HEADER=X-Api-Key
```

## Transport options

### stdio — VS Code Copilot, Cursor, Claude Desktop

`MCP_TRANSPORT` defaults to `stdio`. Add to your client's MCP config:

```json
{
  "mcpServers": {
    "my-bsp-service": {
      "command": "bsp-mcp",
      "env": {
        "BSP_ENDPOINT": "https://api.example.com/bsp",
        "BSP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

For services using a custom API key header instead of Bearer:

```json
{
  "mcpServers": {
    "my-bsp-service": {
      "command": "bsp-mcp",
      "env": {
        "BSP_ENDPOINT": "https://api.example.com/bsp",
        "BSP_API_KEY": "<your-api-key>",
        "BSP_AUTH_TYPE": "apikey",
        "BSP_AUTH_HEADER": "X-Api-Key"
      }
    }
  }
}
```

### HTTP — ChatGPT Desktop

ChatGPT Desktop connects to MCP servers over HTTPS. Start in HTTP mode and expose via a tunnel for local development:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
  BSP_ENDPOINT=https://api.example.com/bsp \
  BSP_API_KEY=<key> \
  node dist/index.js

# Expose via ngrok (or Cloudflare Tunnel)
ngrok http 3001
```

Then in ChatGPT Desktop: **Settings → Apps & Connectors → Create**
- Connector URL: `https://<your-ngrok-subdomain>.ngrok.app/mcp`

### CloudEvent `source` field

When sending a command, `send_command` requires a `source` value. Per BSP, `source` identifies the origin of the command. The required value for a given service is documented in the schema description returned by `get_command_schema` — always read it from there.

## Publishing to npm

Never run `npm publish` directly — the release is fully automated via CI:

```bash
git tag -a mcp/v<x.y.z> -m "Release mcp/v<x.y.z>"
git push origin mcp/v<x.y.z>
```
