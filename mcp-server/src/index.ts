#!/usr/bin/env node
/**
 * best-mcp — MCP server for any BEST-compliant endpoint
 *
 * Exposes the BEST command and query surface as MCP tools so any LLM client
 * can discover, read, and send commands to a BEST-compliant service.
 *
 * ── Single connection (backwards-compatible) ─────────────────────────────────
 *   BEST_ENDPOINT    — Base URL of the BEST HTTP surface (required)
 *                     e.g. https://api.example.com/best  or  https://api.example.com/best/tenants/<id>
 *   BEST_API_KEY     — Credential value (required unless BEST_AUTH_TYPE=none)
 *   BEST_AUTH_TYPE   — bearer (default) | apikey | none
 *   BEST_AUTH_HEADER — Header name when BEST_AUTH_TYPE=apikey, BEST_AUTH_IN=header (default: X-Api-Key)
 *   BEST_AUTH_IN     — header (default) | query
 *   BEST_AUTH_PARAM  — Query param name when BEST_AUTH_IN=query (default: apikey)
 *
 * ── Multiple named connections ────────────────────────────────────────────────
 *   BEST_CONNECTIONS — JSON array of connection objects. Takes precedence over
 *                     the individual BEST_* variables above.
 *                     Each object:
 *                       name        (string, required)  — identifier used in the 'connection' tool param
 *                       endpoint    (string, required)  — base URL of the BEST HTTP surface
 *                       apiKey      (string, optional)  — required unless authType is "none"
 *                       authType    (string, optional, default "bearer") — bearer | apikey | none
 *                       authHeader  (string, optional, default "X-Api-Key")
 *                       authIn      (string, optional, default "header") — header | query
 *                       authParam   (string, optional, default "apikey")
 *                       allowBearerPassthrough (boolean, optional, default false) — allow a
 *                                     per-request Authorization Bearer token to replace the
 *                                     configured credential (see below)
 *                       description (string, optional)  — human-readable description surfaced to the LLM
 *
 *                     Example:
 *                     [
 *                       { "name": "trading",   "endpoint": "https://api.example.com/best/tenants/<id>", "apiKey": "...", "authType": "apikey", "description": "Tenant trading commands and queries" },
 *                       { "name": "platform",  "endpoint": "https://api.example.com/best",              "apiKey": "...", "authType": "apikey", "description": "Cross-tenant platform queries" }
 *                     ]
 *
 * ── Transport ─────────────────────────────────────────────────────────────────
 *   MCP_TRANSPORT   — stdio (default) | http
 *   MCP_HTTP_PORT   — HTTP port when MCP_TRANSPORT=http (default: 3000)
 *
 * Transports:
 *   stdio — for VS Code Copilot, Cursor, Claude Desktop, and other local clients
 *   http  — for ChatGPT Desktop (Settings → Apps & Connectors → /mcp), or a
 *           multi-user backend that calls best-mcp on behalf of many different
 *           end users (see "Per-request credential overrides" below).
 *           Use ngrok or Cloudflare Tunnel to expose locally over HTTPS.
 *
 * ── Per-request credential overrides (HTTP transport only) ──────────────────
 *   A multi-user backend (e.g. a chat service acting on behalf of whichever
 *   user is currently logged in) typically cannot bake one fixed API key into
 *   this server's environment — each incoming request needs its OWN caller's
 *   credentials. When MCP_TRANSPORT=http, two request headers optionally
 *   override the resolved connection for that single call only:
 *
 *   X-Api-Key    — replaces the connection's configured apiKey for this request.
 *   X-Tenant-Id  — replaces the tenant segment of the connection's endpoint for
 *                  this request. Only takes effect on a Mode 1 "<app>/tenant"
 *                  connection (the one auto-generated from BEST_<APP>_TENANT_ID);
 *                  ignored otherwise, since other connections have no tenant
 *                  template to substitute into. Must match ^[A-Za-z0-9_.-]+$ —
 *                  an invalid value is ignored (logged to stderr) rather than
 *                  spliced into the URL.
 *   Authorization: Bearer <token>
 *                — forwarded verbatim to the BEST endpoint as the caller's own
 *                  credential, but ONLY when the connection was explicitly
 *                  configured with BEST_<APP>_ALLOW_BEARER_PASSTHROUGH=true
 *                  (BEST_CONNECTIONS: allowBearerPassthrough, legacy:
 *                  BEST_ALLOW_BEARER_PASSTHROUGH). Off by default for a reason:
 *                  the MCP transport's Authorization header may carry a
 *                  credential meant for THIS server (e.g. MCP OAuth), which
 *                  must never leak upstream unless the operator states both
 *                  hops share one trust domain. A per-request X-Api-Key takes
 *                  precedence — the Bearer token is only used when no explicit
 *                  key override is present (mirrors BEST dual-auth gates, where
 *                  a present API key is authoritative). Bearer scheme only;
 *                  the token is never logged.
 *
 *   No override header is required — omit them all and a request behaves
 *   exactly as configured via environment variables, same as before this
 *   feature existed. stdio is unaffected; there is no per-request boundary to
 *   attach headers to.
 */

import { createServer as createHttpServer, type IncomingHttpHeaders } from 'http';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

// The real published version, surfaced to hosts in the initialize result — a hardcoded constant
// here once drifted to '1.0.0' and made "which best-mcp am I running?" unanswerable.
const PACKAGE_VERSION: string = createRequire(import.meta.url)('../package.json').version;
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';

// ── Connection model ──────────────────────────────────────────────────────────

interface BestConnection {
  name: string;
  endpoint: string;
  apiKey: string;
  authType: string;    // bearer | apikey | none
  authHeader: string;  // used when authType=apikey, authIn=header
  authIn: string;      // header | query
  authParam: string;   // query param name when authIn=query
  // Opt-in (default false): allow a per-request `Authorization: Bearer <token>` header
  // (HTTP transport only) to be forwarded to the BEST endpoint in place of the connection's
  // configured credential. Off by default because the MCP transport's Authorization header
  // may carry a credential meant for THIS server (e.g. OAuth), which must never leak to the
  // upstream BEST service unless the operator explicitly says these are the same trust domain.
  allowBearerPassthrough: boolean;
  description?: string;
  // Only set for a Mode 1 "<app>/tenant" connection: the un-substituted
  // BEST_<APP>_BASE_URL, so a per-request X-Tenant-Id header (HTTP transport
  // only) can rebuild `${tenantTemplateBaseUrl}/tenants/${requestTenantId}`.
  tenantTemplateBaseUrl?: string;
}

// ── Config parsing ────────────────────────────────────────────────────────────

// Legacy compatibility: the protocol short name changed BSP → BEST in spec 0.9.0.
// Accept pre-0.9.0 BSP_* env vars as a fallback for any BEST_* var not explicitly
// set, so existing deployments keep working across the rename.
{
  let legacyVarsUsed = false;
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('BSP_') && value !== undefined) {
      const bestKey = 'BEST_' + key.slice(4);
      if (process.env[bestKey] === undefined) {
        process.env[bestKey] = value;
        legacyVarsUsed = true;
      }
    }
  }
  if (legacyVarsUsed) {
    process.stderr.write('[best-mcp] WARNING: BSP_* environment variables are deprecated — rename them to BEST_*.\n');
  }
}

const TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio';
const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT ?? '3000', 10);

function parseConnections(): BestConnection[] {

  // ── Mode 1: per-app env vars ─────────────────────────────────────────────
  // Detected by the presence of one or more BEST_<APP>_BASE_URL variables.
  // APP must be a single uppercase word (letters and digits only, e.g. TRADING, HR).
  //
  // Required per app:
  //   BEST_<APP>_BASE_URL   — root URL of the BEST HTTP surface
  //   BEST_<APP>_API_KEY    — credential (not required when AUTH_TYPE=none)
  //
  // Optional per app:
  //   BEST_<APP>_TENANT_ID  — when set, auto-generates two connections:
  //                            <app>/tenant   → BASE_URL/tenants/TENANT_ID
  //                            <app>/platform → BASE_URL
  //                          when omitted, generates one connection: <app>
  //   BEST_<APP>_AUTH_TYPE  — bearer (default) | apikey | none
  //   BEST_<APP>_AUTH_HEADER — header name when AUTH_TYPE=apikey, AUTH_IN=header (default: X-Api-Key)
  //   BEST_<APP>_AUTH_IN    — header (default) | query
  //   BEST_<APP>_AUTH_PARAM — query param name when AUTH_IN=query (default: apikey)

  const appNames = Object.keys(process.env)
    .map(key => key.match(/^BEST_([A-Z][A-Z0-9]*)_BASE_URL$/)?.[1])
    .filter((name): name is string => name !== undefined);

  if (appNames.length > 0) {
    const connections: BestConnection[] = [];

    for (const appName of appNames) {
      const p        = `BEST_${appName}`;
      const baseUrl  = (process.env[`${p}_BASE_URL`] ?? '').replace(/\/$/, '');
      const apiKey   = process.env[`${p}_API_KEY`]    ?? '';
      const tenantId = process.env[`${p}_TENANT_ID`];
      const authType  = process.env[`${p}_AUTH_TYPE`]   ?? 'apikey';  // Mode 1 default: apikey (X-Api-Key header)
      const authHeader = process.env[`${p}_AUTH_HEADER`] ?? 'X-Api-Key';
      const authIn    = process.env[`${p}_AUTH_IN`]     ?? 'header';
      const authParam = process.env[`${p}_AUTH_PARAM`]  ?? 'apikey';
      const allowBearerPassthrough = (process.env[`${p}_ALLOW_BEARER_PASSTHROUGH`] ?? '').toLowerCase() === 'true';
      const app       = appName.toLowerCase();

      if (!apiKey && authType !== 'none') {
        process.stderr.write(`[best-mcp] ERROR: BEST_${appName}_API_KEY is required (or set BEST_${appName}_AUTH_TYPE=none)\n`);
        process.exit(1);
      }

      const shared = { apiKey, authType, authHeader, authIn, authParam, allowBearerPassthrough };

      if (tenantId) {
        // Auto-generate two connections from one set of vars
        connections.push({
          ...shared,
          name:        `${app}/tenant`,
          endpoint:    `${baseUrl}/tenants/${tenantId}`,
          tenantTemplateBaseUrl: baseUrl,
          description: `${app} — tenant-scoped commands and queries`,
        });
        connections.push({
          ...shared,
          name:        `${app}/platform`,
          endpoint:    baseUrl,
          description: `${app} — platform root (manifest discovery and cross-tenant operations). Does not expose commands or queries directly.`,
        });
      } else {
        connections.push({
          ...shared,
          name:        app,
          endpoint:    baseUrl,
          description: `${app} — BEST service`,
        });
      }
    }

    return connections;
  }

  // ── Mode 2: BEST_CONNECTIONS JSON array ───────────────────────────────────
  const raw = process.env.BEST_CONNECTIONS;

  if (raw) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch (e) {
      process.stderr.write(`[best-mcp] ERROR: BEST_CONNECTIONS is not valid JSON: ${e}\n`);
      process.exit(1);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      process.stderr.write('[best-mcp] ERROR: BEST_CONNECTIONS must be a non-empty JSON array\n');
      process.exit(1);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (parsed as any[]).map((c, i) => {
      if (!c.name)     { process.stderr.write(`[best-mcp] ERROR: BEST_CONNECTIONS[${i}] missing required field 'name'\n`);     process.exit(1); }
      if (!c.endpoint) { process.stderr.write(`[best-mcp] ERROR: BEST_CONNECTIONS[${i}] missing required field 'endpoint'\n`); process.exit(1); }
      const authType = c.authType ?? 'bearer';
      if (!c.apiKey && authType !== 'none') {
        process.stderr.write(`[best-mcp] ERROR: BEST_CONNECTIONS[${i}] ('${c.name}') missing required field 'apiKey' (or set authType: "none")\n`);
        process.exit(1);
      }
      return {
        name:        String(c.name),
        endpoint:    String(c.endpoint).replace(/\/$/, ''),
        apiKey:      c.apiKey ? String(c.apiKey) : '',
        authType,
        authHeader:  c.authHeader  ? String(c.authHeader)  : 'X-Api-Key',
        authIn:      c.authIn      ? String(c.authIn)      : 'header',
        authParam:   c.authParam   ? String(c.authParam)   : 'apikey',
        allowBearerPassthrough: c.allowBearerPassthrough === true,
        description: c.description ? String(c.description) : undefined,
      } satisfies BestConnection;
    });
  }

  // ── Mode 3: legacy single-connection — BEST_ENDPOINT / BEST_API_KEY ────────
  const endpoint = (process.env.BEST_ENDPOINT ?? '').replace(/\/$/, '');
  const apiKey   = process.env.BEST_API_KEY ?? '';
  const authType = process.env.BEST_AUTH_TYPE ?? 'bearer';
  const missing: string[] = [];
  if (!endpoint) missing.push('BEST_ENDPOINT');
  if (!apiKey && authType !== 'none') missing.push('BEST_API_KEY');
  if (missing.length) {
    process.stderr.write(`[best-mcp] ERROR: missing required environment variables: ${missing.join(', ')}\n`);
    process.stderr.write(`[best-mcp] See README for configuration options.\n`);
    process.exit(1);
  }
  return [{
    name:       'default',
    endpoint,
    apiKey,
    authType,
    authHeader: process.env.BEST_AUTH_HEADER ?? 'X-Api-Key',
    authIn:     process.env.BEST_AUTH_IN     ?? 'header',
    authParam:  process.env.BEST_AUTH_PARAM  ?? 'apikey',
    allowBearerPassthrough: (process.env.BEST_ALLOW_BEARER_PASSTHROUGH ?? '').toLowerCase() === 'true',
  }];
}

const CONNECTIONS = parseConnections();
const MULTI       = CONNECTIONS.length > 1;

function resolveConnection(name?: string): BestConnection {
  if (!MULTI) return CONNECTIONS[0];
  if (!name) throw new Error(
    `Multiple BEST connections are configured — you must specify a 'connection' parameter. ` +
    `Available connections: ${CONNECTIONS.map(c => c.name).join(', ')}. ` +
    `Call list_connections to see full details, then confirm the correct connection with the user before proceeding.`
  );
  const conn = CONNECTIONS.find(c => c.name === name);
  if (!conn) throw new Error(
    `Unknown connection '${name}'. Available: ${CONNECTIONS.map(c => c.name).join(', ')}.`
  );
  return conn;
}

// Tenant IDs are spliced directly into a URL path segment — restrict to a safe
// charset rather than trusting an arbitrary caller-supplied header value.
const SAFE_TENANT_ID = /^[A-Za-z0-9_.-]+$/;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

// Strict RFC 6750 shape: scheme "Bearer" (case-insensitive) + one non-empty token.
// Anything else (Basic, multiple tokens, empty) is not a passthrough candidate.
const BEARER_TOKEN = /^Bearer\s+(\S+)$/i;

// Connections we've already warned about ignoring an Authorization header for, so a
// misconfigured deployment (caller sends a JWT but passthrough is off) is diagnosable
// from the logs without emitting one line per request. Never logs the token itself.
const warnedBearerIgnored = new Set<string>();

/**
 * Applies optional per-request X-Api-Key / X-Tenant-Id / Authorization header
 * overrides (HTTP transport only) to an already-resolved connection. Returns
 * the connection unchanged when no override header is present, so a request
 * that doesn't opt in behaves exactly as if this feature didn't exist.
 *
 * Credential precedence (mirrors typical BEST dual-auth gates, where a present
 * API key is authoritative): an explicit per-request X-Api-Key always wins; the
 * Authorization Bearer token is used only when there is no X-Api-Key AND the
 * connection was explicitly configured with allowBearerPassthrough. The token
 * is forwarded verbatim as `Authorization: Bearer <token>` to the connection's
 * configured endpoint only, and is never logged or persisted.
 */
function applyRequestOverrides(conn: BestConnection, headers: IncomingHttpHeaders): BestConnection {
  const requestApiKey = firstHeaderValue(headers['x-api-key']);
  const requestTenantId = firstHeaderValue(headers['x-tenant-id']);
  const requestBearer = firstHeaderValue(headers['authorization'])?.match(BEARER_TOKEN)?.[1];
  if (!requestApiKey && !requestTenantId && !requestBearer) return conn;

  let endpoint = conn.endpoint;
  if (requestTenantId && conn.tenantTemplateBaseUrl) {
    if (SAFE_TENANT_ID.test(requestTenantId)) {
      endpoint = `${conn.tenantTemplateBaseUrl}/tenants/${requestTenantId}`;
    } else {
      process.stderr.write(
        `[best-mcp] WARNING: ignoring X-Tenant-Id header with unexpected characters for connection '${conn.name}'\n`
      );
    }
  }

  // Bearer passthrough: only when the caller sent no explicit X-Api-Key override
  // and the operator opted this connection in. Forwarding switches the effective
  // auth to `Authorization: Bearer <token>` regardless of the configured authType,
  // so the token can never end up in a query string or a custom header.
  if (!requestApiKey && requestBearer) {
    if (conn.allowBearerPassthrough) {
      return { ...conn, endpoint, authType: 'bearer', apiKey: requestBearer };
    }
    if (!warnedBearerIgnored.has(conn.name)) {
      warnedBearerIgnored.add(conn.name);
      process.stderr.write(
        `[best-mcp] WARNING: request carried an Authorization Bearer token but connection '${conn.name}' ` +
        `has bearer passthrough disabled — falling back to the configured credential. ` +
        `Set allowBearerPassthrough (BEST_<APP>_ALLOW_BEARER_PASSTHROUGH=true) if this connection ` +
        `should authenticate upstream with the caller's own token. (Logged once per connection.)\n`
      );
    }
  }

  return {
    ...conn,
    apiKey: requestApiKey ?? conn.apiKey,
    endpoint,
  };
}

// Disable TLS verification for localhost dev endpoints
for (const conn of CONNECTIONS) {
  if (/^https:\/\/localhost(:\d+)?/.test(conn.endpoint)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.stderr.write(`[best-mcp] WARNING: TLS verification disabled for localhost (connection: ${conn.name})\n`);
    break;
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders(conn: BestConnection): Record<string, string> {
  if (conn.authType === 'none')   return {};
  if (conn.authType === 'bearer') return { Authorization: `Bearer ${conn.apiKey}` };
  if (conn.authType === 'apikey' && conn.authIn === 'header') return { [conn.authHeader]: conn.apiKey };
  return {}; // apikey in query — credentials go in the URL, not headers
}

function withAuthQuery(path: string, conn: BestConnection): string {
  if (conn.authType === 'apikey' && conn.authIn === 'query') {
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}${encodeURIComponent(conn.authParam)}=${encodeURIComponent(conn.apiKey)}`;
  }
  return path;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    const err = json.error;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') return err.message ?? JSON.stringify(err);
    return json.title ?? json.detail ?? text;
  } catch {
    return text;
  }
}

async function bestGet<T>(path: string, conn: BestConnection): Promise<T> {
  const response = await fetch(`${conn.endpoint}${withAuthQuery(path, conn)}`, {
    headers: { ...authHeaders(conn), Accept: 'application/json' }
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function bestPost<T>(path: string, body: unknown, conn: BestConnection): Promise<T> {
  const response = await fetch(`${conn.endpoint}${withAuthQuery(path, conn)}`, {
    method: 'POST',
    headers: {
      ...authHeaders(conn),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

// Default CloudEvent `source` for commands sent through this client. The commands spec defines
// `source` as a URI-reference identifying the ORIGIN of the command — which, for a command an LLM
// composes here, is this client — and forbids servers from routing by `source` alone. Callers
// override it only for services whose schema descriptions document a specific required value.
const CLIENT_SOURCE = 'urn:best-mcp';

// When multiple connections are configured, every operation tool gains an optional
// 'connection' parameter. The LLM must specify it; if context makes the choice
// ambiguous, it should call list_connections first and confirm with the user.
const CONNECTION_PROP: Record<string, object> = MULTI ? {
  connection: {
    type: 'string',
    description:
      `Name of the BEST connection to target. Available: ${CONNECTIONS.map(c => c.name).join(', ')}. ` +
      'Call list_connections to see full details (endpoint, description) for each. ' +
      'If you are not certain which connection the user intends, call list_connections ' +
      'and ask the user to confirm before proceeding — a wrong connection may silently ' +
      'reach the wrong service.'
  }
} : {};

// Shared by both catalogue tools. Summary is the default because a catalogue's job is to let a caller
// CHOOSE an operation, and a thoroughly documented service makes the full listing too large for that —
// one real endpoint returns 47 KB for ~65 commands, which clients spill to disk before a model reads it.
const CATALOGUE_DETAIL_PROP: Record<string, object> = {
  detail: {
    type: 'string',
    enum: ['summary', 'full'],
    description:
      "How much description text to return per entry. 'summary' (the default) truncates each description " +
      "to keep the listing small — enough to pick an operation. 'full' returns every description verbatim; " +
      'only worth it when you genuinely need to compare long descriptions across many entries, since the ' +
      "per-operation schema tools already return one operation's complete text."
  }
};

const TOOLS: Tool[] = [
  // list_connections is only meaningful (and only shown) when MULTI is true
  ...(MULTI ? [{
    name: 'list_connections',
    description:
      'List all configured BEST connections with their names, endpoints, and descriptions. ' +
      'Call this when you are unsure which connection to use for a given request, ' +
      'then confirm the correct connection with the user before calling any operation tool.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  } as Tool] : []),
  {
    name: 'get_command_catalogue',
    description:
      'List all commands this BEST endpoint accepts. ' +
      'Returns the command catalogue: every command type with its schema name, version, dataschema URI, and description. ' +
      'Call this first to discover what you can send. ' +
      'Examples: configure-broker, configure-indicator-alert, submit-signal, archive-broker. ' +
      "An entry's 'workflows' array names the published recipes that command participates in — when your task " +
      'spans several operations, read the recipe FIRST (get_workflows with that id) instead of assembling the ' +
      'sequence from raw schemas. ' +
      "Descriptions are truncated by default so the listing stays small — call get_command_schema for one " +
      "command's complete description and fields, or pass detail='full' to get every description verbatim.",
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP, ...CATALOGUE_DETAIL_PROP }, required: [] }
  },
  {
    name: 'get_command_schema',
    description:
      'Fetch the full JSON Schema for a specific command type and version. ' +
      'Use this to discover the exact fields required before calling send_command. ' +
      'Get the schema name and version from get_command_catalogue. ' +
      "If the command's catalogue entry or description names a workflow, fetch that recipe " +
      '(get_workflows with workflow_id) before planning a multi-step process — it carries the ' +
      'ordering and cross-step guidance the schema alone cannot.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Command schema name in kebab-case, from get_command_catalogue (e.g. configure-broker)'
        },
        version: {
          type: 'string',
          description: 'Schema version, from get_command_catalogue (e.g. 1.0)'
        }
      },
      required: ['schema', 'version']
    }
  },
  {
    name: 'send_command',
    description:
      'Send a command to the BEST endpoint. ' +
      'Use get_command_catalogue to discover available commands, ' +
      'then get_command_schema to learn the required payload fields, ' +
      'then call this with the schema name, version, and data payload. ' +
      "The CloudEvent envelope is built automatically; 'source' defaults to this client's own " +
      "identity (BEST servers route by 'type', never by 'source' alone). Supply an explicit " +
      'source ONLY when the schema description documents a specific required value — never invent one. ' +
      'Returns the accepted command ID on success, plus the correlation ID when the server echoes one ' +
      '(spec 0.9.2+) — use it with get_events / sample_event_stream to observe the outcome events.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Command schema name in kebab-case, from get_command_catalogue (e.g. configure-broker)'
        },
        version: {
          type: 'string',
          description: 'Schema version, from get_command_catalogue (e.g. 1.0)'
        },
        source: {
          type: 'string',
          description: "Optional CloudEvent source — a URI-reference identifying the command's origin. " +
            `Defaults to '${CLIENT_SOURCE}' (this client). Set it ONLY when the schema description ` +
            'returned by get_command_schema documents a specific required value (legacy source-routing ' +
            'dialects); do not invent one.'
        },
        correlation_id: {
          type: 'string',
          description: 'Optional correlation ID (spec 0.9.2+). Omit it and the server correlates by the ' +
            "command's own ID — the right default for a fresh piece of work. Pass a value ONLY to attach " +
            'this command to an EXISTING chain: an earlier correlation ID from a send_command response or ' +
            "from an event's correlationid attribute. Pre-0.9.2 servers ignore it."
        },
        data: {
          type: 'object',
          description: 'Command payload matching the JSON Schema from get_command_schema.',
          additionalProperties: true
        }
      },
      required: ['schema', 'version', 'data']
    }
  },
  {
    name: 'send_command_and_wait',
    description:
      'Send a command to the BEST endpoint and wait for it to be processed by polling a query. ' +
      'Use this instead of send_command when you need to confirm the command was processed before proceeding, ' +
      'for example subscribing a price feed and then verifying it appears in the list. ' +
      'Provide poll_query (query schema name from get_query_catalogue) and poll_until_contains ' +
      '(a string that must appear in the query result, e.g. a ticker symbol). ' +
      'Returns the command ID plus the query result once the condition is met, ' +
      'or a timeout warning if the condition is not met within timeout_seconds.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Command schema name in kebab-case (e.g. subscribe-price-feed)'
        },
        version: {
          type: 'string',
          description: 'Schema version (e.g. 1.0)'
        },
        source: {
          type: 'string',
          description: `Optional CloudEvent source — defaults to '${CLIENT_SOURCE}'. Set it ONLY when the schema description documents a specific required value.`
        },
        correlation_id: {
          type: 'string',
          description: 'Optional correlation ID (spec 0.9.2+) — same semantics as on send_command: omit for ' +
            'a fresh chain, pass an existing correlation ID to join one. Pre-0.9.2 servers ignore it.'
        },
        data: {
          type: 'object',
          description: 'Command payload matching the JSON Schema from get_command_schema.',
          additionalProperties: true
        },
        poll_query: {
          type: 'string',
          description: 'Query schema name to poll after sending the command (from get_query_catalogue). If omitted the tool behaves like send_command.'
        },
        poll_until_contains: {
          type: 'string',
          description: 'String that must appear in the query result for the wait to succeed. If omitted, the first successful query response is returned.'
        },
        poll_params: {
          type: 'object',
          description: 'Optional query parameters for the poll query.',
          additionalProperties: true
        },
        poll_parameters: {
          type: 'object',
          description: "Alias of 'poll_params' — both are accepted; if both are present, 'poll_params' wins.",
          additionalProperties: true
        },
        timeout_seconds: {
          type: 'number',
          description: 'Maximum seconds to wait for the query to satisfy the condition (default: 30).'
        }
      },
      required: ['schema', 'version', 'data']
    }
  },
  {
    name: 'get_query_catalogue',
    description:
      'List all read queries available at this BEST endpoint. ' +
      'Returns the query catalogue: every query type with its schema name, version, dataschema URI, and description. ' +
      'Call this to discover what current-state data you can read. ' +
      'Examples: list-brokers (get configured broker accounts), list-alerts (get configured alerts), list-price-feeds (get configured price feeds). ' +
      "An entry's 'workflows' array names the published recipes that query participates in (see get_workflows). " +
      "Descriptions are truncated by default so the listing stays small — call get_query_schema for one " +
      "query's complete description and parameters, or pass detail='full' to get every description verbatim.",
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP, ...CATALOGUE_DETAIL_PROP }, required: [] }
  },
  {
    name: 'get_query_schema',
    description:
      'Fetch the JSON Schema for a specific query type and version. ' +
      'Returns the accepted parameters and the exact response shape. ' +
      'Get the schema name and version from get_query_catalogue.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Query schema name in kebab-case, from get_query_catalogue (e.g. list-brokers)'
        },
        version: {
          type: 'string',
          description: 'Schema version, from get_query_catalogue (e.g. 1.0)'
        }
      },
      required: ['schema', 'version']
    }
  },
  {
    name: 'execute_query',
    description:
      'Execute a read query against the BEST endpoint and return current state data synchronously. ' +
      'Use get_query_catalogue to discover available queries, ' +
      'then get_query_schema to learn the accepted parameters and response shape, ' +
      'then call this with the schema name and any parameters. ' +
      'Example: execute list-brokers to get IDs needed for a subsequent send_command call.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Query schema name in kebab-case, from get_query_catalogue (e.g. list-brokers)'
        },
        params: {
          type: 'object',
          description: 'Optional query parameters as key-value pairs matching the parameters schema from get_query_schema. Omit or pass {} if no parameters are needed.',
          additionalProperties: true
        },
        parameters: {
          type: 'object',
          description: "Alias of 'params' — both are accepted; if both are present, 'params' wins.",
          additionalProperties: true
        }
      },
      required: ['schema']
    }
  },
  {
    name: 'get_manifest',
    description:
      "Fetch the BEST discovery manifest (/.well-known/best) for a connection's host — the public " +
      'front door describing the service: spec version, authentication requirements, declared ' +
      'capabilities (commands, queries, events) with their endpoints and push channels (sse/mcp). ' +
      "For a tenant-scoped connection the tenant's own manifest is returned when the host publishes one. " +
      'Call this to learn whether the service publishes events, how to receive them, and what the ' +
      'capability descriptions recommend.',
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP }, required: [] }
  },
  {
    name: 'get_events',
    description:
      "Query the service's historical event log (GET /events) — immutable facts already published, " +
      'as CloudEvents. Standard parameters (all optional, combinable): correlationId (events for one ' +
      'command submission or stream key), type (CloudEvent type, PascalCase), source, from / to ' +
      '(ISO 8601 window), limit, after (pagination cursor from a previous response\'s nextCursor). ' +
      'Turn-based polling loop: call with your filters, remember the newest event id / the response ' +
      'cursor, pass it back next turn, dedupe by event id. For events produced from now FORWARD in a ' +
      'short window, use sample_event_stream instead. Services may support extra vendor parameters — ' +
      "the manifest's events capability description says which.",
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        params: {
          type: 'object',
          description: 'Optional query parameters as key-value pairs (correlationId, type, source, from, to, limit, after, plus any vendor extensions).',
          additionalProperties: true
        },
        parameters: {
          type: 'object',
          description: "Alias of 'params' — both are accepted; if both are present, 'params' wins.",
          additionalProperties: true
        }
      },
      required: []
    }
  },
  {
    name: 'get_event_schema',
    description:
      'Fetch the JSON Schema document for a specific event type and version (GET /events/{schema}/{version}). ' +
      'Use it to interpret the data payload of events returned by get_events or sample_event_stream. ' +
      'Untyped events have no schema — their catalogue description is the documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        schema: {
          type: 'string',
          description: 'Event schema name in kebab-case (e.g. price-tick)'
        },
        version: {
          type: 'string',
          description: 'Schema version (e.g. 1.0)'
        }
      },
      required: ['schema', 'version']
    }
  },
  {
    name: 'sample_event_stream',
    description:
      "Open the service's live event stream (GET /events/stream, SSE) and collect events for a bounded " +
      'window, then return them. This is how a turn-based caller samples live events: the connection is ' +
      'held only for the duration of this call — collection stops at max_events or max_seconds, ' +
      'whichever comes first (bounds are enforced client-side, so this works against any conformant ' +
      'endpoint). The stream delivers events produced AFTER it opens; for past events use get_events. ' +
      "Pass the previous call's lastEventId as last_event_id to resume without gaps where the server " +
      'supports it. This tool CANNOT watch the stream continuously — for standing reactions, look for ' +
      "the service's own alerting/webhook commands in get_command_catalogue.",
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        params: {
          type: 'object',
          description: 'Optional stream filter parameters as key-value pairs (correlationId, type, source, plus any vendor extensions).',
          additionalProperties: true
        },
        parameters: {
          type: 'object',
          description: "Alias of 'params' — both are accepted; if both are present, 'params' wins.",
          additionalProperties: true
        },
        max_seconds: {
          type: 'number',
          description: 'Maximum seconds to keep the stream open (default 15, clamped to 1–120).'
        },
        max_events: {
          type: 'number',
          description: 'Stop after collecting this many events (default 10, clamped to 1–100).'
        },
        last_event_id: {
          type: 'string',
          description: 'Sent as Last-Event-ID so the server can resume after the last event you saw (where supported).'
        }
      },
      required: []
    }
  },
  {
    name: 'get_workflows',
    description:
      "List the service's published workflows, or fetch ONE full recipe by passing workflow_id. " +
      'Workflows are read-only recipes for multi-step processes — an ordered list of catalogue ' +
      'operations (commands and queries) with per-step guidance — the optional ' +
      'io.best.agents.workflows capability (spec 0.9.4+; older vendor-extension servers are handled ' +
      'transparently). Without workflow_id you get the INDEX (id, name, description per recipe — ' +
      'steps elided); pass a workflow_id from the index to read that recipe\'s steps. Follow the ' +
      'steps in order, sending each command / executing each query yourself and waiting for its ' +
      'result before the next — the service never executes the sequence for you. Command and query ' +
      'catalogue entries may carry a "workflows" array naming the recipes they participate in. ' +
      'Many services publish none, in which case this returns a short note.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        workflow_id: {
          type: 'string',
          description: "A workflow id from the index (e.g. 'io.acme.workflows.onboard-a-worker') — returns that recipe with its full steps."
        }
      },
      required: []
    }
  }
];
// ── Argument validation ───────────────────────────────────────────────────────

/**
 * Host/protocol metadata is conventionally underscore-prefixed and is not part of a tool's contract,
 * so it is never treated as an unknown argument.
 */
const isMetaKey = (key: string): boolean => key.startsWith('_');

/**
 * Validates a tool call's arguments against that tool's own declared inputSchema, BEFORE the handler
 * runs. Returns an error message, or null when the arguments are acceptable.
 *
 * Why this exists: the tools already declared `required`, but nothing enforced it. MCP hosts are not
 * obliged to validate arguments, and the ones that don't forwarded whatever the model produced. A
 * misplaced key was then silently dropped, which fails in a way nobody can diagnose from the outside:
 *
 *   - `execute_query` given send_command's `data` instead of `params` ran the query with NO
 *     parameters. An unfiltered query is usually one the caller may not run, so the endpoint answered
 *     "not authorised" — and two separate debugging sessions went looking for a permissions problem
 *     that did not exist.
 *   - `get_query_schema` without `version` fetched `/queries/{schema}/undefined`, reporting a missing
 *     schema rather than a missing argument.
 *
 * The earlier fix for the first case added `parameters` as an alias of `params` (see
 * handleExecuteQuery). That helped the single most common misspelling but could not help the general
 * case — there is always another plausible name, and `data` is a real field on a sibling tool.
 *
 * Enforcement is deliberately server-side rather than `additionalProperties: false` on the declared
 * schemas: a host that does not validate is exactly the situation this must survive, and a host that
 * does would then also reject argument keys the protocol may add later. Validating here works
 * regardless of what the host does, and lets the error name the offending key and the accepted ones.
 */
function validateToolArgs(name: string, args: Record<string, unknown>): string | null {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return null; // Unknown tool names are the dispatch's error to report, not ours.

  const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  const accepted = Object.keys(schema.properties ?? {});

  const unknown = Object.keys(args).filter(k => !isMetaKey(k) && !accepted.includes(k));
  if (unknown.length > 0) {
    // The specific confusion worth naming, because it is the one that costs hours: 'data' is
    // send_command's payload, and passing it to a query used to run that query unfiltered.
    const hint = unknown.includes('data') && accepted.includes('params')
      ? " Note: query parameters go in 'params' — 'data' is send_command's payload field."
      : '';
    return `Unknown argument(s) for ${name}: ${unknown.join(', ')}. Accepted: ${accepted.join(', ')}.` +
      `${hint} Nothing was sent to the endpoint — arguments are not silently ignored.`;
  }

  const missing = (schema.required ?? []).filter(k => {
    const value = args[k];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0) {
    return `Missing required argument(s) for ${name}: ${missing.join(', ')}. ` +
      `Accepted: ${accepted.join(', ')}. Nothing was sent to the endpoint.`;
  }

  // A value outside a declared enum would otherwise fall through to whatever the handler's default
  // happens to be — the same silent-wrong-behaviour this function exists to stop.
  for (const [key, spec] of Object.entries(schema.properties ?? {})) {
    const allowed = (spec as { enum?: unknown[] }).enum;
    if (!Array.isArray(allowed)) continue;
    const value = args[key];
    if (value !== undefined && !allowed.includes(value)) {
      return `Invalid value for '${key}' on ${name}: ${JSON.stringify(value)}. ` +
        `Allowed: ${allowed.map(v => JSON.stringify(v)).join(', ')}. Nothing was sent to the endpoint.`;
    }
  }

  return null;
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleListConnections(): string {
  return JSON.stringify(
    CONNECTIONS.map(c => ({
      name:        c.name,
      endpoint:    c.endpoint,
      description: c.description ?? '(no description)',
    })),
    null, 2
  );
}

/** Longest description kept per entry in a summary catalogue listing. */
const SUMMARY_DESCRIPTION_CHARS = 200;

/**
 * Truncates one catalogue entry's description for summary mode, leaving every other field alone.
 *
 * A character cap rather than "first sentence": service descriptions routinely OPEN with routing
 * metadata (e.g. "Source: managing. Schema: cancel-absence/1.0. Cancels an existing absence…"), so
 * keeping the first sentence would throw away the part that says what the operation does. The cut
 * lands on a word boundary when one is close enough, so the tail is not a half-word.
 */
function summariseCatalogueEntry(entry: unknown): unknown {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return entry;

  const fields = entry as Record<string, unknown>;
  const description = fields.description;
  if (typeof description !== 'string' || description.length <= SUMMARY_DESCRIPTION_CHARS) return entry;

  const clipped = description.slice(0, SUMMARY_DESCRIPTION_CHARS);
  const lastSpace = clipped.lastIndexOf(' ');
  const kept = (lastSpace > SUMMARY_DESCRIPTION_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd();
  return { ...fields, description: `${kept}…` };
}

/**
 * Renders a catalogue as JSON, truncating descriptions unless the caller asked for 'full'.
 *
 * Catalogues exist to let a caller CHOOSE an operation, and a service that documents each one
 * thoroughly makes the full listing far too large for that job — one real endpoint returns 47 KB for
 * ~65 commands, which clients spill to disk before a model can read it. The per-operation schema tools
 * already return the complete description, so the long text is never lost, only deferred.
 *
 * Output stays a bare JSON array in both modes: the shape is unchanged, and the affordance is
 * advertised in the tool description where the model actually reads it.
 */
function renderCatalogue(entries: unknown[], args: Record<string, unknown>): string {
  const detail = typeof args.detail === 'string' ? args.detail.toLowerCase() : 'summary';
  const rendered = detail === 'full' ? entries : entries.map(summariseCatalogueEntry);
  return JSON.stringify(rendered, null, 2);
}

async function handleGetCommandCatalogue(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const data = await bestGet<{ commands: unknown[] }>('/commands', conn);
  if (!data.commands.length) return 'No commands available at this endpoint.';
  return renderCatalogue(data.commands, args);
}

async function handleGetCommandSchema(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bestGet<unknown>(`/commands/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

async function handleSendCommand(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const source  = (args.source as string | undefined) ?? CLIENT_SOURCE;
  const correlationId = args.correlation_id as string | undefined;
  const data    = args.data as Record<string, unknown>;

  // CloudEvent type is PascalCase: configure-broker → ConfigureBroker
  const type = schema
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  const cloudEvent = {
    specversion:     '1.0',
    id:              randomUUID(),
    source,
    type,
    datacontenttype: 'application/json',
    // Absolute catalogue URI — BEST is a conformant CloudEvents 1.0 profile
    dataschema:      `${conn.endpoint.replace(/\/+$/, '')}/commands/${schema}/${version}`,
    time:            new Date().toISOString(),
    // correlationid (spec 0.9.2+): only set when the caller joins an existing chain — omitted,
    // the server defaults it to the command's own id. Pre-0.9.2 servers ignore the attribute.
    ...(correlationId ? { correlationid: correlationId } : {}),
    data
  };

  const result = await bestPost<{ id: string; correlationId?: string }>('/commands', cloudEvent, conn);
  // A 0.9.2+ server echoes the effective correlation ID; older servers return only the command id.
  const effectiveCorrelation = result.correlationId ?? correlationId;
  return `Command accepted. ID: ${result.id}` + (effectiveCorrelation
    ? `\nCorrelation ID: ${effectiveCorrelation} — pass it as get_events / sample_event_stream params {"correlationId": "${effectiveCorrelation}"} to observe the outcome events.`
    : '');
}

async function handleSendCommandAndWait(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const commandResult = await handleSendCommand(args, conn);

  const pollQuery = args.poll_query as string | undefined;
  if (!pollQuery) return commandResult;

  const pollParams = (args.poll_params ?? args.poll_parameters ?? {}) as Record<string, unknown>;
  const pollUntilContains = args.poll_until_contains as string | undefined;
  const timeoutSeconds = (args.timeout_seconds as number) ?? 30;
  const intervalMs = 2000;
  const maxAttempts = Math.ceil((timeoutSeconds * 1000) / intervalMs);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    try {
      const result = await handleExecuteQuery({ schema: pollQuery, params: pollParams }, conn);
      const normalize = (s: string) => s.replace(/\s+/g, '');
      if (!pollUntilContains || normalize(result).includes(normalize(pollUntilContains))) {
        return `${commandResult}\n\nQuery result after processing:\n${result}`;
      }
    } catch {
      // transient query failure — keep polling
    }
  }

  return `${commandResult}\n\nWarning: timed out after ${timeoutSeconds}s waiting for '${pollUntilContains ?? 'any result'}' in ${pollQuery}.`;
}

async function handleGetQueryCatalogue(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const data = await bestGet<{ queries: unknown[] }>('/queries', conn);
  if (!data.queries.length) return 'No queries available at this endpoint.';
  return renderCatalogue(data.queries, args);
}

async function handleGetQuerySchema(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bestGet<unknown>(`/queries/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

/**
 * Models routinely name the parameter-bag argument 'parameters' (the tool descriptions themselves
 * speak of "parameters"), and unknown keys are not rejected — before the alias, such calls silently
 * ran the query UNFILTERED, which servers can surface as misleading authorisation errors.
 */
function paramsBag(args: Record<string, unknown>): Record<string, unknown> {
  return (args.params ?? args.parameters ?? {}) as Record<string, unknown>;
}

function toQueryString(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function handleExecuteQuery(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema = args.schema as string;
  const queryString = toQueryString(paramsBag(args));

  const path = queryString ? `/queries/${schema}?${queryString}` : `/queries/${schema}`;
  const result = await bestGet<unknown>(path, conn);
  return JSON.stringify(result, null, 2);
}

// ── Events capability (io.best.agents.events) ────────────────────────────────

async function handleGetEvents(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const queryString = toQueryString(paramsBag(args));
  const path = queryString ? `/events?${queryString}` : '/events';
  const result = await bestGet<unknown>(path, conn);
  return JSON.stringify(result, null, 2);
}

async function handleGetEventSchema(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bestGet<unknown>(`/events/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Bounded live-stream sample: open the SSE stream, collect until max_events or max_seconds,
 * abort, return what arrived. Bounds are enforced CLIENT-side so this works against any
 * conformant endpoint — no vendor stream parameters required. A turn-based caller cannot hold
 * the connection between turns; this gives it a window instead.
 */
async function handleSampleEventStream(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const maxSeconds = clampNumber(args.max_seconds, 15, 1, 120);
  const maxEvents  = clampNumber(args.max_events, 10, 1, 100);
  const lastEventId = typeof args.last_event_id === 'string' && args.last_event_id ? args.last_event_id : undefined;

  const queryString = toQueryString(paramsBag(args));
  const path = withAuthQuery(queryString ? `/events/stream?${queryString}` : '/events/stream', conn);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxSeconds * 1000);
  const startedAt = Date.now();
  const events: unknown[] = [];
  let lastSeenId: string | undefined;
  let serverClosed = false;

  try {
    const response = await fetch(`${conn.endpoint}${path}`, {
      headers: {
        ...authHeaders(conn),
        Accept: 'text/event-stream',
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new Error(message);
    }
    if (!response.body) throw new Error('The stream response carried no body.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    readLoop:
    while (true) {
      const { done, value } = await reader.read();
      if (done) { serverClosed = true; break; }
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are blank-line separated; field order within a frame is not fixed.
      let separator: number;
      while ((separator = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);

        const dataLines: string[] = [];
        let frameId: string | undefined;
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
          if (line.startsWith(':')) continue; // comment / keepalive
          if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
          else if (line.startsWith('id:')) frameId = line.slice(3).trim();
        }
        if (frameId) lastSeenId = frameId;
        if (dataLines.length === 0) continue;

        const payload = dataLines.join('\n');
        try { events.push(JSON.parse(payload)); } catch { events.push(payload); }
        if (events.length >= maxEvents) break readLoop;
      }
    }
  } catch (error) {
    // The time bound firing surfaces as an abort — that is the normal end of a sample.
    const aborted = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
    if (!aborted) throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }

  return JSON.stringify({
    events,
    count: events.length,
    lastEventId: lastSeenId ?? null,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
    endedBecause: events.length >= maxEvents ? 'max_events reached'
      : serverClosed ? 'server closed the stream'
      : 'max_seconds reached',
    note: 'The stream is closed. Events arriving after this sample are not delivered — call again ' +
      '(passing lastEventId as last_event_id) to take another sample, or use get_events for history.'
  }, null, 2);
}

// ── Discovery manifest (/.well-known/best) ────────────────────────────────────

/**
 * The manifest is the public front door (served without credentials, per the discovery spec) at
 * the HOST root — not under the connection's endpoint path. For a tenant-scoped connection, the
 * global manifest's `tenants.manifest` URI template resolves the tenant's own manifest.
 */
async function handleGetManifest(conn: BestConnection): Promise<string> {
  const origin = new URL(conn.endpoint).origin;
  const globalUrl = `${origin}/.well-known/best`;

  const fetchManifest = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new Error(`GET ${url} → ${response.status}: ${message}`);
    }
    return response.json();
  };

  const globalManifest = await fetchManifest(globalUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = (globalManifest as any)?.best?.tenants?.manifest;
  const tenantId = conn.endpoint.match(/\/tenants\/([^/?#]+)\/?$/)?.[1];
  if (typeof template === 'string' && tenantId) {
    const tenantUrl = template.replace('{tenantId}', encodeURIComponent(tenantId));
    try {
      const tenantManifest = await fetchManifest(tenantUrl);
      return JSON.stringify({ manifestUrl: tenantUrl, scope: 'tenant', manifest: tenantManifest }, null, 2);
    } catch {
      // Fall through to the global manifest — better a coarser answer than none.
    }
  }

  return JSON.stringify({ manifestUrl: globalUrl, scope: 'global', manifest: globalManifest }, null, 2);
}

async function handleGetWorkflows(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  // Workflows are the optional io.best.agents.workflows capability (spec 0.9.4). 0.9.4 servers
  // serve a shallow index at /workflows and one full recipe at /workflows/{id}; pre-0.9.4
  // vendor-extension servers serve every recipe, steps included, in the one list. A service that
  // publishes neither simply has no /workflows endpoint — treat that as "none offered" rather
  // than an error, so the agent can move on.
  const workflowId = args.workflow_id as string | undefined;

  if (workflowId) {
    try {
      const recipe = await bestGet<unknown>(`/workflows/${encodeURIComponent(workflowId)}`, conn);
      return JSON.stringify(recipe, null, 2);
    } catch {
      // No per-id route (pre-0.9.4) or unknown id — the full list settles which.
    }
    try {
      const data = await bestGet<{ workflows?: Array<Record<string, unknown>> }>('/workflows', conn);
      const workflows = data.workflows ?? [];
      const match = workflows.find(w => w.id === workflowId || w.name === workflowId);
      if (match) return JSON.stringify(match, null, 2);
      const ids = workflows.map(w => String(w.id ?? w.name ?? '?'));
      return `No workflow '${workflowId}' here. Published workflows: ${ids.join(', ') || '(none)'}.`;
    } catch (error) {
      return `This endpoint does not publish workflows (an optional capability). Details: ${String(error)}`;
    }
  }

  try {
    const data = await bestGet<{ workflows?: Array<Record<string, unknown>> }>('/workflows', conn);
    const workflows = data.workflows ?? [];
    if (!workflows.length) return 'This endpoint publishes no workflows.';
    // Always answer with an index, whichever shape the server serves: the list must stay small
    // enough for an agent to read in one turn and choose — steps come from a workflow_id call.
    const carriedSteps = workflows.some(w => Array.isArray(w.steps));
    const index = workflows.map(({ steps: _steps, ...rest }) => rest);
    const note = carriedSteps
      ? 'Steps elided — pass workflow_id to read one full recipe.'
      : 'Pass workflow_id to read one full recipe with its steps.';
    return `${JSON.stringify(index, null, 2)}\n\n${note}`;
  } catch (error) {
    return `This endpoint does not publish workflows (an optional capability). Details: ${String(error)}`;
  }
}

// ── Server factory ────────────────────────────────────────────────────────────

const connectionSummary = MULTI
  ? `\n\n## Connections\n\nMultiple BEST connections are configured:\n` +
    CONNECTIONS.map(c =>
      `- **${c.name}**: ${c.endpoint}${c.description ? ` — ${c.description}` : ''}`
    ).join('\n') +
    `\n\nAlways specify the \`connection\` parameter on every tool call. ` +
    `If the user's request does not make it obvious which connection to use, ` +
    `call \`list_connections\` first and ask the user to confirm before proceeding.`
  : `\n\nConnected to: ${CONNECTIONS[0].endpoint}`;

const SERVER_INSTRUCTIONS = (`
You are connected to one or more BEST-compliant service endpoints.
${connectionSummary}

## Discovering running services

Service management is a domain like any other — BEST has no dedicated registry endpoint. If an endpoint exposes a directory of its services, it does so as queries (e.g. a 'list-services' query) and commands (e.g. 'RegisterService'). Use the query tools below to discover and read it.

## Reading current state (queries)

Use the query tools to read domain state before issuing commands that require existing IDs:

1. Call get_query_catalogue to discover available queries.
2. Call get_query_schema for the chosen query to understand accepted parameters and response shape.
3. Call execute_query to get the data synchronously.

## Sending commands

1. Call get_command_catalogue to discover available commands.
2. Call get_command_schema for the chosen command to learn required fields and field types.
3. Gather any missing field values from the user.
4. Call send_command with schema, version, and data payload.

CloudEvent envelope rules (enforced by send_command):
- 'type': PascalCase of the schema name (configure-broker → ConfigureBroker). Converted automatically.
- 'source': identifies the command's ORIGIN and defaults to this client's identity ('${CLIENT_SOURCE}') — BEST servers route by 'type', never by 'source' alone. Pass an explicit source ONLY when the schema description documents a specific required value; never invent one.
- 'dataschema': the absolute catalogue URI '{endpoint}/commands/{schema}/{version}'. Built automatically from the connection endpoint.
- 'correlationid' (spec 0.9.2+): omitted by default — the server then correlates by the command's own ID. Pass correlation_id only to join an existing chain.

## Correlating commands with their outcomes

On 0.9.2+ servers every accepted command has a correlation ID (yours, or defaulting to the command's ID), echoed as 'correlationId' in the send_command response; every event that command causes carries it as 'correlationid', including across multi-step process chains. To check what a command actually did: send it, then call get_events (or sample_event_stream for a live window) with params {"correlationId": "<the echoed value>"}. Pre-0.9.2 servers echo nothing and don't stamp events — there, fall back to the service's queries to confirm outcomes (send_command_and_wait automates that pattern).

## Receiving events (facts the service publishes)

Call get_manifest first — it reveals whether the service declares the events capability, which push
channels it supports, and any turn-based guidance in the capability description. Then pick by need:

- Past events: get_events with filters (correlationId, type, from/to, limit). Poll in a loop by
  passing the previous response's cursor (after / a vendor cursor field) and deduping by event id.
- Live events, short window: sample_event_stream opens the SSE stream and returns what arrives
  within max_events / max_seconds. Pass the previous sample's lastEventId as last_event_id to
  resume without gaps where the server supports it.
- Interpreting payloads: get_event_schema for typed events.

You cannot hold the stream open between turns. For standing reactions ("when X happens, do Y"),
do not poll indefinitely — look for the service's own alerting/webhook commands in
get_command_catalogue and configure those instead.

## Following a published workflow (optional)

Some services publish read-only "recipes" for common multi-step processes. BEFORE hand-assembling a
multi-step process from raw schemas, check for a recipe: command/query catalogue entries may carry a
'workflows' array naming the recipes they participate in, and get_workflows lists every recipe's id,
name and description. Pass workflow_id to read one recipe's ordered steps; each step references a
command or query you already have (by its dataschema URI) plus guidance on how the steps combine.
Follow the steps in order — send each command / execute each query and wait for its result before
the next, threading ids from earlier results into later steps. The service does not run the
sequence for you; it only describes it. Workflows are optional — if get_workflows reports none, fall
back to discovering commands/queries directly.

## Error handling

If a command fails, relay the error message verbatim to the user — it is actionable.
`).trim();

function createMcpServer(requestHeaders?: IncomingHttpHeaders): Server {
  // `instructions` in the initialize result is the ONLY channel most hosts (Copilot, Claude
  // Desktop, Cursor) read server guidance from — the tools/list `_meta` copy below is kept for
  // hosts that surface it, but was the sole carrier before 2.3.1 and standard hosts never saw it.
  const server = new Server(
    { name: 'best-mcp', version: PACKAGE_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
    _meta: { instructions: SERVER_INSTRUCTIONS }
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
      // Before anything else, including connection resolution: a bad argument list is the caller's
      // mistake to fix, and reporting it as such is the whole point (see validateToolArgs).
      const argError = validateToolArgs(name, safeArgs);
      if (argError) {
        return { content: [{ type: 'text', text: `Error: ${argError}` }], isError: true };
      }

      // list_connections needs no connection resolution
      if (name === 'list_connections') {
        return { content: [{ type: 'text', text: handleListConnections() }] };
      }

      // All other tools resolve their target connection from the optional 'connection' arg,
      // then apply any per-request X-Api-Key / X-Tenant-Id header overrides (HTTP only).
      const baseConn = resolveConnection(safeArgs.connection as string | undefined);
      const conn = requestHeaders ? applyRequestOverrides(baseConn, requestHeaders) : baseConn;

      let text: string;
      switch (name) {
        case 'get_command_catalogue': text = await handleGetCommandCatalogue(safeArgs, conn);   break;
        case 'get_command_schema':    text = await handleGetCommandSchema(safeArgs, conn);     break;
        case 'send_command':          text = await handleSendCommand(safeArgs, conn);          break;
        case 'send_command_and_wait': text = await handleSendCommandAndWait(safeArgs, conn);   break;
        case 'get_query_catalogue':   text = await handleGetQueryCatalogue(safeArgs, conn);     break;
        case 'get_query_schema':      text = await handleGetQuerySchema(safeArgs, conn);       break;
        case 'execute_query':         text = await handleExecuteQuery(safeArgs, conn);         break;
        case 'get_manifest':          text = await handleGetManifest(conn);                    break;
        case 'get_events':            text = await handleGetEvents(safeArgs, conn);            break;
        case 'get_event_schema':      text = await handleGetEventSchema(safeArgs, conn);       break;
        case 'sample_event_stream':   text = await handleSampleEventStream(safeArgs, conn);    break;
        case 'get_workflows':         text = await handleGetWorkflows(safeArgs, conn);         break;
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
      return { content: [{ type: 'text', text }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error: ${String(error)}` }], isError: true };
    }
  });

  return server;
}

// ── Start ─────────────────────────────────────────────────────────────────────

if (TRANSPORT === 'http') {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.url === '/mcp' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = undefined; }

      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const server = createMcpServer(req.headers);

      res.on('close', () => { server.close(); transport.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } else if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', transport: 'http' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(HTTP_PORT, () => {
    process.stderr.write(`[best-mcp] HTTP server listening on port ${HTTP_PORT}\n`);
    process.stderr.write(`[best-mcp] MCP endpoint: http://localhost:${HTTP_PORT}/mcp\n`);
    for (const c of CONNECTIONS) {
      process.stderr.write(`[best-mcp] Connection '${c.name}': ${c.endpoint}\n`);
    }
  });
} else {
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
}
