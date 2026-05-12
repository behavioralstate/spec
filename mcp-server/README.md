# oap-mcp

MCP server for any [OAP-compliant](https://openagentprotocol.io) endpoint. Exposes the OAP command and query surface as MCP tools so any LLM client (ChatGPT Desktop, Claude Desktop, GitHub Copilot, Cursor) can discover and interact with an OAP service.

## Tools

| Tool | What it does |
|---|---|
| `get_command_catalogue` | List all commands this endpoint accepts |
| `get_command_schema` | Fetch the full JSON Schema for a command type — learn the exact fields required |
| `send_command` | Send a command (CloudEvent 1.0 envelope built automatically) |
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

Set two environment variables:

| Variable | Required | Description |
|---|---|---|
| `OAP_ENDPOINT` | yes | Base URL of the OAP HTTP surface (see below) |
| `OAP_API_KEY` | yes | API key — sent as `Authorization: Bearer <key>` |
| `MCP_TRANSPORT` | no | `stdio` (default) or `http` |
| `MCP_HTTP_PORT` | no | HTTP port when `MCP_TRANSPORT=http` (default: `3000`) |

**`OAP_ENDPOINT`** should point at the root of the OAP HTTP surface — the base path from which `/commands`, `/queries`, etc. are resolved. Examples:

```
# Generic OAP service
OAP_ENDPOINT=https://api.example.com/oap

# Multi-tenant service (dotQuant example)
OAP_ENDPOINT=https://dotquant.io/api/oap/tenants/<your-tenant-id>
```

## Transport options

### stdio — VS Code Copilot, Cursor, Claude Desktop

`MCP_TRANSPORT` defaults to `stdio`. Add to your client's MCP config:

```json
{
  "mcpServers": {
    "my-oap-service": {
      "command": "oap-mcp",
      "env": {
        "OAP_ENDPOINT": "https://api.example.com/oap",
        "OAP_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### HTTP — ChatGPT Desktop

ChatGPT Desktop connects to MCP servers over HTTPS. Start in HTTP mode and expose via a tunnel for local development:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
  OAP_ENDPOINT=https://api.example.com/oap \
  OAP_API_KEY=<key> \
  node dist/index.js

# Expose via ngrok (or Cloudflare Tunnel)
ngrok http 3001
```

Then in ChatGPT Desktop: **Settings → Apps & Connectors → Create**
- Connector URL: `https://<your-ngrok-subdomain>.ngrok.app/mcp`

### CloudEvent `source` field

When sending a command, `send_command` requires a `source` value. Per OAP, `source` identifies the origin of the command. The required value for a given service is documented in the schema description returned by `get_command_schema` — always read it from there.

## Publishing to npm

```bash
npm version patch   # or minor / major
npm run build
npm pkg fix
npm publish --access public
```
