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
      'Examples: configure-broker, configure-indicator-alert, submit-signal, archive-broker.',
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP }, required: [] }
  },
  {
    name: 'get_command_schema',
    description:
      'Fetch the full JSON Schema for a specific command type and version. ' +
      'Use this to discover the exact fields required before calling send_command. ' +
      'Get the schema name and version from get_command_catalogue.',
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
      'then get_command_schema to learn the required payload fields and the required source value, ' +
      'then call this with the schema name, version, source, and data payload. ' +
      'IMPORTANT: the source field is used by the backend to route the CloudEvent — ' +
      'an incorrect value may cause the command to be silently dropped. ' +
      'Always read the required source value from the schema description returned by get_command_schema before calling this tool. ' +
      'If the schema description does not specify a source value, ask the user before proceeding. ' +
      'Returns the accepted command ID on success.',
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
          description: 'CloudEvent source — identifies the origin of this command. The required value is specified in the schema description returned by get_command_schema; always read it from there and do not invent it.'
        },
        data: {
          type: 'object',
          description: 'Command payload matching the JSON Schema from get_command_schema.',
          additionalProperties: true
        }
      },
      required: ['schema', 'version', 'source', 'data']
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
          description: 'CloudEvent source — read the required value from get_command_schema before calling this tool'
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
        timeout_seconds: {
          type: 'number',
          description: 'Maximum seconds to wait for the query to satisfy the condition (default: 30).'
        }
      },
      required: ['schema', 'version', 'source', 'data']
    }
  },
  {
    name: 'get_query_catalogue',
    description:
      'List all read queries available at this BEST endpoint. ' +
      'Returns the query catalogue: every query type with its schema name, version, dataschema URI, and description. ' +
      'Call this to discover what current-state data you can read. ' +
      'Examples: list-brokers (get configured broker accounts), list-alerts (get configured alerts), list-price-feeds (get configured price feeds).',
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP }, required: [] }
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
    name: 'get_workflows',
    description:
      "List the service's published workflows — optional, read-only \"descriptive sequence\" recipes: " +
      'a named, ordered list of command schemas with per-step guidance for a multi-step process. ' +
      'Workflows are a vendor extension (BEST does not require them) — many services publish none, ' +
      'in which case this returns a short note. Each step\'s "schema" is a command from ' +
      'get_command_catalogue: follow the steps in order, sending each command (and waiting for its ' +
      'result) before the next. The service does not execute the steps for you — it only describes them.',
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP }, required: [] }
  }
];
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

async function handleGetCommandCatalogue(conn: BestConnection): Promise<string> {
  const data = await bestGet<{ commands: unknown[] }>('/commands', conn);
  if (!data.commands.length) return 'No commands available at this endpoint.';
  return JSON.stringify(data.commands, null, 2);
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
  const source  = args.source as string;
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
    dataschema:      `${schema}/${version}`,
    time:            new Date().toISOString(),
    data
  };

  const result = await bestPost<{ id: string }>('/commands', cloudEvent, conn);
  return `Command accepted. ID: ${result.id}`;
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

async function handleGetQueryCatalogue(conn: BestConnection): Promise<string> {
  const data = await bestGet<{ queries: unknown[] }>('/queries', conn);
  if (!data.queries.length) return 'No queries available at this endpoint.';
  return JSON.stringify(data.queries, null, 2);
}

async function handleGetQuerySchema(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bestGet<unknown>(`/queries/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

async function handleExecuteQuery(args: Record<string, unknown>, conn: BestConnection): Promise<string> {
  const schema = args.schema as string;
  // Models routinely name this argument 'parameters' (the tool description itself speaks of
  // "parameters"), and unknown keys are not rejected — before the alias, such calls silently
  // ran the query UNFILTERED, which servers can surface as misleading authorisation errors.
  const params = (args.params ?? args.parameters ?? {}) as Record<string, unknown>;

  const queryString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const path = queryString ? `/queries/${schema}?${queryString}` : `/queries/${schema}`;
  const result = await bestGet<unknown>(path, conn);
  return JSON.stringify(result, null, 2);
}

async function handleGetWorkflows(conn: BestConnection): Promise<string> {
  // Workflows are an optional vendor extension (see the BEST "Composing Commands into Processes"
  // guide). A service that doesn't publish them simply has no /workflows endpoint — treat that as
  // "none offered" rather than an error, so the agent can move on.
  try {
    const data = await bestGet<{ workflows?: unknown[] }>('/workflows', conn);
    const workflows = data.workflows ?? [];
    if (!workflows.length) return 'This endpoint publishes no workflows.';
    return JSON.stringify(workflows, null, 2);
  } catch (error) {
    return `This endpoint does not publish workflows (an optional vendor extension). Details: ${String(error)}`;
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
2. Call get_command_schema for the chosen command to learn: required fields, field types, and the required 'source' routing value (stated in the schema top-level description).
3. Gather any missing field values from the user.
4. Call send_command with schema, version, source, and data payload.

CloudEvent envelope rules (enforced by send_command):
- 'type': PascalCase of the schema name (configure-broker → ConfigureBroker). Converted automatically.
- 'source': read from the schema description. NEVER invent or default this value.
- 'dataschema': relative URI '{schema}/{version}' (e.g. configure-broker/1.0). Never an absolute or environment-specific URL.

## Following a published workflow (optional)

Some services publish read-only "recipes" for common multi-step processes. Call get_workflows to
list them. Each workflow is an ordered list of steps; each step names a 'schema' that is a command
(or query) you already have. Follow the steps in order — send each command and wait for its result
before the next, threading ids from earlier results into later steps. The service does not run the
sequence for you; it only describes it. Workflows are optional — if get_workflows reports none, fall
back to discovering commands/queries directly.

## Error handling

If a command fails, relay the error message verbatim to the user — it is actionable.
`).trim();

function createMcpServer(requestHeaders?: IncomingHttpHeaders): Server {
  const server = new Server(
    { name: 'best-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
    _meta: { instructions: SERVER_INSTRUCTIONS }
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    try {
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
        case 'get_command_catalogue': text = await handleGetCommandCatalogue(conn);            break;
        case 'get_command_schema':    text = await handleGetCommandSchema(safeArgs, conn);     break;
        case 'send_command':          text = await handleSendCommand(safeArgs, conn);          break;
        case 'send_command_and_wait': text = await handleSendCommandAndWait(safeArgs, conn);   break;
        case 'get_query_catalogue':   text = await handleGetQueryCatalogue(conn);              break;
        case 'get_query_schema':      text = await handleGetQuerySchema(safeArgs, conn);       break;
        case 'execute_query':         text = await handleExecuteQuery(safeArgs, conn);         break;
        case 'get_workflows':         text = await handleGetWorkflows(conn);                   break;
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
