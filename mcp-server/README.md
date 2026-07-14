# bsp-mcp

MCP server for any [BSP-compliant](https://behavioralstate.io) endpoint. Exposes the BSP command and query surface as MCP tools so any LLM client (ChatGPT Desktop, Claude Desktop, GitHub Copilot, Cursor) can discover and interact with a BSP service.

Supports **multiple named connections** in a single server instance — useful for admins who need to operate across tenant-scoped and platform-level surfaces, or across entirely separate BSP applications.

---

## Start with AI

Paste either prompt into your LLM client to get configured in under a minute.

**Configure bsp-mcp** — generates the exact env vars and `mcpServers` JSON for your client:

```
Configure bsp-mcp so I can use my BSP service from [VS Code Copilot / Claude Desktop / Cursor].

Service base URL: [https://api.example.com/bsp]
API key: [my-api-key]
Tenant ID: [my-tenant-id]  ← remove this line if not multi-tenant

Output the exact env vars and mcpServers JSON block to add to my client config.

bsp-mcp docs: https://behavioralstate.io/docs/transports/mcp
```

**Make your service BSP-compliant** — scaffolds the four required endpoints in your framework:

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

---

## Tools

| Tool | What it does |
|---|---|
| `list_connections` | List all configured connections with names, endpoints, and descriptions *(only shown when multiple connections are configured)* |
| `get_command_catalogue` | List all commands this endpoint accepts |
| `get_command_schema` | Fetch the full JSON Schema for a command type — learn the exact fields required |
| `send_command` | Send a command (CloudEvent 1.0 envelope built automatically) |
| `send_command_and_wait` | Send a command then poll a query until a condition is met |
| `get_query_catalogue` | List all read queries this endpoint exposes |
| `get_query_schema` | Fetch the JSON Schema for a query — learn parameters and response shape |
| `execute_query` | Execute a query and return current state synchronously |
| `get_workflows` | List the service's published "descriptive sequence" recipes — an optional vendor extension; returns a note if the service publishes none |

Intended LLM flow: `get_command_catalogue` → pick a command → `get_command_schema` → gather fields → `send_command`.
Optionally call `get_workflows` first to see if the service publishes a ready-made recipe for a multi-step process.

When multiple connections are configured all operation tools gain an optional `connection` parameter. If the LLM is not certain which connection the user intends, it calls `list_connections` and asks the user to confirm before proceeding.

---

## Setup

### 1. Install and build

```bash
cd mcp-server
npm install
npm run build
```

### 2. Configure

There are three configuration modes. Use whichever fits your setup — they are mutually exclusive and checked in the order listed.

---

### Mode 1 — Per-app env vars *(recommended)*

One set of `BSP_<APP>_*` variables per application. The app name is a single uppercase word (letters and digits, no underscores), e.g. `TRADING`, `HR`, `ACCOUNTING`.

#### Required

| Variable | Description |
|---|---|
| `BSP_<APP>_BASE_URL` | Root URL of the BSP HTTP surface |
| `BSP_<APP>_API_KEY` | Credential — not required when `AUTH_TYPE=none` |

#### Optional

| Variable | Default | Description |
|---|---|---|
| `BSP_<APP>_TENANT_ID` | — | When set, **auto-generates two connections**: `<app>/tenant` (tenant-scoped) and `<app>/platform` (platform-level). When omitted, generates one connection: `<app>`. |
| `BSP_<APP>_AUTH_TYPE` | `apikey` | How the credential is sent — see [Auth types](#auth-types) below. **Defaults to `apikey` in Mode 1** (unlike Modes 2 and 3 which default to `bearer`). |
| `BSP_<APP>_AUTH_HEADER` | `X-Api-Key` | Header name — only used when `AUTH_TYPE=apikey` and `AUTH_IN=header` |
| `BSP_<APP>_AUTH_IN` | `header` | Where the key is sent when `AUTH_TYPE=apikey`: `header` or `query` |
| `BSP_<APP>_AUTH_PARAM` | `apikey` | Query parameter name — only used when `AUTH_IN=query` |
| `BSP_<APP>_ALLOW_BEARER_PASSTHROUGH` | `false` | Allow a per-request `Authorization: Bearer <token>` header to be forwarded to the BSP endpoint as the caller's own credential — see [Per-request credential overrides](#http--per-request-credential-overrides-multi-user-backends). |

#### Auth types

> **Default differs by mode.** Mode 1 defaults to `apikey` because BSP services typically use API key headers. Modes 2 and 3 default to `bearer` for backward compatibility.

| `AUTH_TYPE` | What it does | Extra vars needed |
|---|---|---|
| `apikey` *(Mode 1 default)* | Sends the key in a custom header or query param | `AUTH_HEADER` (header name, default `X-Api-Key`) or `AUTH_IN=query` + `AUTH_PARAM` |
| `bearer` *(Modes 2 & 3 default)* | Sends `Authorization: Bearer <key>` | none |
| `none` | No credentials sent (public endpoint) | `API_KEY` not required |

#### Examples

**Single app, tenant + platform surfaces (most common admin setup):**

```
BSP_TRADING_BASE_URL=https://api.example.com/bsp
BSP_TRADING_API_KEY=your-api-key
BSP_TRADING_TENANT_ID=your-tenant-id
BSP_TRADING_AUTH_TYPE=apikey
```

This generates two connections automatically:
- `trading/tenant` → `https://api.example.com/bsp/tenants/your-tenant-id`
- `trading/platform` → `https://api.example.com/bsp`

**Two separate apps:**

```
BSP_TRADING_BASE_URL=https://trading.example.com/bsp
BSP_TRADING_API_KEY=trading-key
BSP_TRADING_TENANT_ID=tenant-abc
BSP_TRADING_AUTH_TYPE=apikey

BSP_HR_BASE_URL=https://hr.example.com/bsp
BSP_HR_API_KEY=hr-key
BSP_HR_TENANT_ID=tenant-abc
BSP_HR_AUTH_TYPE=apikey
```

This generates four connections: `trading/tenant`, `trading/platform`, `hr/tenant`, `hr/platform`.

**App with no tenant scope:**

```
BSP_MYAPP_BASE_URL=https://api.example.com/bsp
BSP_MYAPP_API_KEY=your-api-key
```

Generates one connection: `myapp`.

#### MCP client config (stdio)

```json
{
  "mcpServers": {
    "bsp": {
      "command": "npx",
      "args": ["bsp-mcp"],
      "env": {
        "BSP_TRADING_BASE_URL": "https://api.example.com/bsp",
        "BSP_TRADING_API_KEY": "your-api-key",
        "BSP_TRADING_TENANT_ID": "your-tenant-id",
        "BSP_TRADING_AUTH_TYPE": "apikey"
      }
    }
  }
}
```

---

### Mode 2 — `BSP_CONNECTIONS` JSON array

For advanced scenarios where per-app vars are not flexible enough. Set `BSP_CONNECTIONS` to a JSON array of connection objects — each connection is fully explicit with no auto-generation.

Each object:

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | yes | — | Connection identifier used in the `connection` tool parameter |
| `endpoint` | yes | — | Fully-resolved base URL (no `{tenantId}` placeholder) |
| `apiKey` | yes* | — | Credential (*not required when `authType` is `none`) |
| `authType` | no | `bearer` | `bearer` · `apikey` · `none` |
| `authHeader` | no | `X-Api-Key` | Header name when `authType=apikey` and `authIn=header` |
| `authIn` | no | `header` | `header` or `query` |
| `authParam` | no | `apikey` | Query param name when `authIn=query` |
| `allowBearerPassthrough` | no | `false` | Allow a per-request `Authorization: Bearer <token>` header to be forwarded to the BSP endpoint — see [Per-request credential overrides](#http--per-request-credential-overrides-multi-user-backends) |
| `description` | no | — | Human-readable description surfaced to the LLM for connection selection |

---

### Mode 3 — Legacy single connection

For simple single-endpoint setups. Use the flat `BSP_*` variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `BSP_ENDPOINT` | yes | — | Base URL of the BSP HTTP surface |
| `BSP_API_KEY` | yes* | — | Credential (*not required when `BSP_AUTH_TYPE=none`) |
| `BSP_AUTH_TYPE` | no | `bearer` | `bearer` · `apikey` · `none` |
| `BSP_AUTH_HEADER` | no | `X-Api-Key` | Header name when `AUTH_TYPE=apikey` |
| `BSP_AUTH_IN` | no | `header` | `header` or `query` |
| `BSP_AUTH_PARAM` | no | `apikey` | Query param name when `AUTH_IN=query` |
| `BSP_ALLOW_BEARER_PASSTHROUGH` | no | `false` | Allow a per-request `Authorization: Bearer <token>` header to be forwarded to the BSP endpoint — see [Per-request credential overrides](#http--per-request-credential-overrides-multi-user-backends) |

---

## Transport options

### stdio — VS Code Copilot, Cursor, Claude Desktop

`MCP_TRANSPORT` defaults to `stdio`. Add to your client's MCP config (see [Mode 1](#mode-1--per-app-env-vars-recommended) example above).

### HTTP — ChatGPT Desktop

Start in HTTP mode and expose via a tunnel:

```bash
MCP_TRANSPORT=http MCP_HTTP_PORT=3001 \
  BSP_TRADING_BASE_URL=https://api.example.com/bsp \
  BSP_TRADING_API_KEY=<key> \
  BSP_TRADING_AUTH_TYPE=apikey \
  node dist/index.js

ngrok http 3001
```

Then in ChatGPT Desktop: **Settings → Apps & Connectors → Create**, connector URL: `https://<subdomain>.ngrok.app/mcp`

### HTTP — per-request credential overrides (multi-user backends)

A backend that calls bsp-mcp on behalf of many different logged-in users (e.g. a chat assistant) can't bake one fixed API key into the server's environment — it needs to supply the *current* caller's credentials on every request. When `MCP_TRANSPORT=http`, three optional request headers override the resolved connection for that single call only:

| Header | Effect |
|---|---|
| `X-Api-Key` | Replaces the connection's configured `apiKey` for this request. |
| `X-Tenant-Id` | Replaces the tenant segment of the endpoint for this request. Only applies to a Mode 1 `<app>/tenant` connection (the one generated from `BSP_<APP>_TENANT_ID`) — ignored on connections with no tenant template. Must match `^[A-Za-z0-9_.-]+$`; an invalid value is ignored (and logged) rather than spliced into the URL. |
| `Authorization: Bearer <token>` | Forwarded verbatim to the BSP endpoint as the caller's own credential (e.g. a session JWT for a BSP surface that accepts JWTs) — **only when the connection is explicitly configured with `allowBearerPassthrough`** (`BSP_<APP>_ALLOW_BEARER_PASSTHROUGH=true` / `allowBearerPassthrough: true` / `BSP_ALLOW_BEARER_PASSTHROUGH=true`). Bearer scheme only. When forwarded, the effective auth for that request becomes `Authorization: Bearer <token>` regardless of the configured `authType`, so the token can never land in a query string or custom header. |

No override header is required — omit them all and a request behaves exactly as configured via environment variables. This has no effect on stdio (there's no per-request boundary to attach headers to).

**Precedence:** an explicit per-request `X-Api-Key` always wins; the `Authorization` Bearer token is only used when no `X-Api-Key` is present. This mirrors BSP dual-auth gates, where a present API key is authoritative and never falls through to the JWT.

**Security — why Bearer passthrough is opt-in (default off):** on the MCP HTTP transport, the `Authorization` header may carry a credential intended for *this server* (e.g. MCP OAuth between the client and bsp-mcp). Forwarding it upstream by default would leak that credential across a trust boundary. Enable passthrough only when the MCP caller and the BSP endpoint share one trust domain — i.e. the token the caller sends *is* the credential the BSP service expects. The token is only ever sent to the connection's configured endpoint, over the transport that endpoint's URL specifies (use HTTPS), and is never logged. If a request carries a Bearer token while passthrough is disabled, bsp-mcp falls back to the configured credential and logs a one-time warning per connection (without the token) so the misconfiguration is diagnosable.

**Fail-closed tip:** for a multi-user deployment where *every* request must carry per-caller credentials, keep the connection's configured `apiKey` set to a deliberately invalid placeholder (e.g. `invalid-set-x-api-key-per-request`). A request that arrives without credentials then fails authentication at the BSP service instead of silently acting as a shared identity.

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: <the current user's api key>" \
  -H "X-Tenant-Id: <the current user's tenant>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute_query","arguments":{"connection":"trading/tenant","schema":"list-brokers","params":{}}}}'
```

Or, with `BSP_TRADING_ALLOW_BEARER_PASSTHROUGH=true`, authenticating the caller with their session JWT instead of an API key:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <the current user's session JWT>" \
  -H "X-Tenant-Id: <the current user's tenant>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"execute_query","arguments":{"connection":"trading/tenant","schema":"list-brokers","params":{}}}}'
```

---

## CloudEvent `source` field

When sending a command, `send_command` requires a `source` value. The required value is documented in the schema `description` returned by `get_command_schema` — always read it from there, never invent it.

---

## Publishing to npm

Never run `npm publish` directly — the release is fully automated via CI:

```bash
git tag -a mcp/v<x.y.z> -m "Release mcp/v<x.y.z>"
git push origin mcp/v<x.y.z>
```
