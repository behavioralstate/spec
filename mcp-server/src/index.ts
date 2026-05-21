#!/usr/bin/env node
/**
 * bsp-mcp — MCP server for any BSP-compliant endpoint
 *
 * Exposes the BSP command and query surface as MCP tools so any LLM client
 * can discover, read, and send commands to a BSP-compliant service.
 *
 * ── Single connection (backwards-compatible) ─────────────────────────────────
 *   BSP_ENDPOINT    — Base URL of the BSP HTTP surface (required)
 *                     e.g. https://api.example.com/bsp  or  https://api.example.com/bsp/tenants/<id>
 *   BSP_API_KEY     — Credential value (required unless BSP_AUTH_TYPE=none)
 *   BSP_AUTH_TYPE   — bearer (default) | apikey | none
 *   BSP_AUTH_HEADER — Header name when BSP_AUTH_TYPE=apikey, BSP_AUTH_IN=header (default: X-Api-Key)
 *   BSP_AUTH_IN     — header (default) | query
 *   BSP_AUTH_PARAM  — Query param name when BSP_AUTH_IN=query (default: apikey)
 *
 * ── Multiple named connections ────────────────────────────────────────────────
 *   BSP_CONNECTIONS — JSON array of connection objects. Takes precedence over
 *                     the individual BSP_* variables above.
 *                     Each object:
 *                       name        (string, required)  — identifier used in the 'connection' tool param
 *                       endpoint    (string, required)  — base URL of the BSP HTTP surface
 *                       apiKey      (string, optional)  — required unless authType is "none"
 *                       authType    (string, optional, default "bearer") — bearer | apikey | none
 *                       authHeader  (string, optional, default "X-Api-Key")
 *                       authIn      (string, optional, default "header") — header | query
 *                       authParam   (string, optional, default "apikey")
 *                       description (string, optional)  — human-readable description surfaced to the LLM
 *
 *                     Example:
 *                     [
 *                       { "name": "trading",   "endpoint": "https://api.example.com/bsp/tenants/<id>", "apiKey": "...", "authType": "apikey", "description": "Tenant trading commands and queries" },
 *                       { "name": "platform",  "endpoint": "https://api.example.com/bsp",              "apiKey": "...", "authType": "apikey", "description": "Cross-tenant platform queries" }
 *                     ]
 *
 * ── Transport ─────────────────────────────────────────────────────────────────
 *   MCP_TRANSPORT   — stdio (default) | http
 *   MCP_HTTP_PORT   — HTTP port when MCP_TRANSPORT=http (default: 3000)
 *
 * Transports:
 *   stdio — for VS Code Copilot, Cursor, Claude Desktop, and other local clients
 *   http  — for ChatGPT Desktop (Settings → Apps & Connectors → /mcp)
 *           Use ngrok or Cloudflare Tunnel to expose locally over HTTPS.
 */

import { createServer as createHttpServer } from 'http';
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

interface BspConnection {
  name: string;
  endpoint: string;
  apiKey: string;
  authType: string;    // bearer | apikey | none
  authHeader: string;  // used when authType=apikey, authIn=header
  authIn: string;      // header | query
  authParam: string;   // query param name when authIn=query
  description?: string;
}

// ── Config parsing ────────────────────────────────────────────────────────────

const TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio';
const HTTP_PORT = parseInt(process.env.MCP_HTTP_PORT ?? '3000', 10);

function parseConnections(): BspConnection[] {

  // ── Mode 1: per-app env vars ─────────────────────────────────────────────
  // Detected by the presence of one or more BSP_<APP>_BASE_URL variables.
  // APP must be a single uppercase word (letters and digits only, e.g. TRADING, HR).
  //
  // Required per app:
  //   BSP_<APP>_BASE_URL   — root URL of the BSP HTTP surface
  //   BSP_<APP>_API_KEY    — credential (not required when AUTH_TYPE=none)
  //
  // Optional per app:
  //   BSP_<APP>_TENANT_ID  — when set, auto-generates two connections:
  //                            <app>/tenant   → BASE_URL/tenants/TENANT_ID
  //                            <app>/platform → BASE_URL
  //                          when omitted, generates one connection: <app>
  //   BSP_<APP>_AUTH_TYPE  — bearer (default) | apikey | none
  //   BSP_<APP>_AUTH_HEADER — header name when AUTH_TYPE=apikey, AUTH_IN=header (default: X-Api-Key)
  //   BSP_<APP>_AUTH_IN    — header (default) | query
  //   BSP_<APP>_AUTH_PARAM — query param name when AUTH_IN=query (default: apikey)

  const appNames = Object.keys(process.env)
    .map(key => key.match(/^BSP_([A-Z][A-Z0-9]*)_BASE_URL$/)?.[1])
    .filter((name): name is string => name !== undefined);

  if (appNames.length > 0) {
    const connections: BspConnection[] = [];

    for (const appName of appNames) {
      const p        = `BSP_${appName}`;
      const baseUrl  = (process.env[`${p}_BASE_URL`] ?? '').replace(/\/$/, '');
      const apiKey   = process.env[`${p}_API_KEY`]    ?? '';
      const tenantId = process.env[`${p}_TENANT_ID`];
      const authType  = process.env[`${p}_AUTH_TYPE`]   ?? 'apikey';  // Mode 1 default: apikey (X-Api-Key header)
      const authHeader = process.env[`${p}_AUTH_HEADER`] ?? 'X-Api-Key';
      const authIn    = process.env[`${p}_AUTH_IN`]     ?? 'header';
      const authParam = process.env[`${p}_AUTH_PARAM`]  ?? 'apikey';
      const app       = appName.toLowerCase();

      if (!apiKey && authType !== 'none') {
        process.stderr.write(`[bsp-mcp] ERROR: BSP_${appName}_API_KEY is required (or set BSP_${appName}_AUTH_TYPE=none)\n`);
        process.exit(1);
      }

      const shared = { apiKey, authType, authHeader, authIn, authParam };

      if (tenantId) {
        // Auto-generate two connections from one set of vars
        connections.push({
          ...shared,
          name:        `${app}/tenant`,
          endpoint:    `${baseUrl}/tenants/${tenantId}`,
          description: `${app} — tenant-scoped commands, queries, and agent registry (list_services)`,
        });
        connections.push({
          ...shared,
          name:        `${app}/platform`,
          endpoint:    baseUrl,
          description: `${app} — platform root (manifest discovery and cross-tenant operations). Does not expose commands, queries, or the agent registry directly.`,
        });
      } else {
        connections.push({
          ...shared,
          name:        app,
          endpoint:    baseUrl,
          description: `${app} — BSP service`,
        });
      }
    }

    return connections;
  }

  // ── Mode 2: BSP_CONNECTIONS JSON array ───────────────────────────────────
  const raw = process.env.BSP_CONNECTIONS;

  if (raw) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch (e) {
      process.stderr.write(`[bsp-mcp] ERROR: BSP_CONNECTIONS is not valid JSON: ${e}\n`);
      process.exit(1);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      process.stderr.write('[bsp-mcp] ERROR: BSP_CONNECTIONS must be a non-empty JSON array\n');
      process.exit(1);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (parsed as any[]).map((c, i) => {
      if (!c.name)     { process.stderr.write(`[bsp-mcp] ERROR: BSP_CONNECTIONS[${i}] missing required field 'name'\n`);     process.exit(1); }
      if (!c.endpoint) { process.stderr.write(`[bsp-mcp] ERROR: BSP_CONNECTIONS[${i}] missing required field 'endpoint'\n`); process.exit(1); }
      const authType = c.authType ?? 'bearer';
      if (!c.apiKey && authType !== 'none') {
        process.stderr.write(`[bsp-mcp] ERROR: BSP_CONNECTIONS[${i}] ('${c.name}') missing required field 'apiKey' (or set authType: "none")\n`);
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
        description: c.description ? String(c.description) : undefined,
      } satisfies BspConnection;
    });
  }

  // ── Mode 3: legacy single-connection — BSP_ENDPOINT / BSP_API_KEY ────────
  const endpoint = (process.env.BSP_ENDPOINT ?? '').replace(/\/$/, '');
  const apiKey   = process.env.BSP_API_KEY ?? '';
  const authType = process.env.BSP_AUTH_TYPE ?? 'bearer';
  const missing: string[] = [];
  if (!endpoint) missing.push('BSP_ENDPOINT');
  if (!apiKey && authType !== 'none') missing.push('BSP_API_KEY');
  if (missing.length) {
    process.stderr.write(`[bsp-mcp] ERROR: missing required environment variables: ${missing.join(', ')}\n`);
    process.stderr.write(`[bsp-mcp] See README for configuration options.\n`);
    process.exit(1);
  }
  return [{
    name:       'default',
    endpoint,
    apiKey,
    authType,
    authHeader: process.env.BSP_AUTH_HEADER ?? 'X-Api-Key',
    authIn:     process.env.BSP_AUTH_IN     ?? 'header',
    authParam:  process.env.BSP_AUTH_PARAM  ?? 'apikey',
  }];
}

const CONNECTIONS = parseConnections();
const MULTI       = CONNECTIONS.length > 1;

function resolveConnection(name?: string): BspConnection {
  if (!MULTI) return CONNECTIONS[0];
  if (!name) throw new Error(
    `Multiple BSP connections are configured — you must specify a 'connection' parameter. ` +
    `Available connections: ${CONNECTIONS.map(c => c.name).join(', ')}. ` +
    `Call list_connections to see full details, then confirm the correct connection with the user before proceeding.`
  );
  const conn = CONNECTIONS.find(c => c.name === name);
  if (!conn) throw new Error(
    `Unknown connection '${name}'. Available: ${CONNECTIONS.map(c => c.name).join(', ')}.`
  );
  return conn;
}

// Disable TLS verification for localhost dev endpoints
for (const conn of CONNECTIONS) {
  if (/^https:\/\/localhost(:\d+)?/.test(conn.endpoint)) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    process.stderr.write(`[bsp-mcp] WARNING: TLS verification disabled for localhost (connection: ${conn.name})\n`);
    break;
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function authHeaders(conn: BspConnection): Record<string, string> {
  if (conn.authType === 'none')   return {};
  if (conn.authType === 'bearer') return { Authorization: `Bearer ${conn.apiKey}` };
  if (conn.authType === 'apikey' && conn.authIn === 'header') return { [conn.authHeader]: conn.apiKey };
  return {}; // apikey in query — credentials go in the URL, not headers
}

function withAuthQuery(path: string, conn: BspConnection): string {
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

async function bspGet<T>(path: string, conn: BspConnection): Promise<T> {
  const response = await fetch(`${conn.endpoint}${withAuthQuery(path, conn)}`, {
    headers: { ...authHeaders(conn), Accept: 'application/json' }
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function bspPost<T>(path: string, body: unknown, conn: BspConnection): Promise<T> {
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
      `Name of the BSP connection to target. Available: ${CONNECTIONS.map(c => c.name).join(', ')}. ` +
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
      'List all configured BSP connections with their names, endpoints, and descriptions. ' +
      'Call this when you are unsure which connection to use for a given request, ' +
      'then confirm the correct connection with the user before calling any operation tool.',
    inputSchema: { type: 'object', properties: {}, required: [] }
  } as Tool] : []),
  {
    name: 'get_command_catalogue',
    description:
      'List all commands this BSP endpoint accepts. ' +
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
      'Send a command to the BSP endpoint. ' +
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
      'Send a command to the BSP endpoint and wait for it to be processed by polling a query. ' +
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
      'List all read queries available at this BSP endpoint. ' +
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
      'Execute a read query against the BSP endpoint and return current state data synchronously. ' +
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
        }
      },
      required: ['schema']
    }
  },
  {
    name: 'list_services',
    description:
      'List all agent services registered at this BSP endpoint. ' +
      'Returns each service with its id, name, status (running/paused/stopped/error), ' +
      'the command types it accepts, and the event types it produces. ' +
      'Use this to discover what AI agents or background services are currently running behind this endpoint. ' +
      'Requires the endpoint to implement the io.bsp.agents.registry capability.',
    inputSchema: { type: 'object', properties: { ...CONNECTION_PROP }, required: [] }
  },
  {
    name: 'get_service',
    description:
      'Get the full descriptor of a specific registered service by its id. ' +
      'Returns status, accepted command types, produced event types, metadata, and endpoint. ' +
      'Get the service id from list_services.',
    inputSchema: {
      type: 'object',
      properties: {
        ...CONNECTION_PROP,
        id: {
          type: 'string',
          description: 'Service identifier, from list_services'
        }
      },
      required: ['id']
    }
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

async function handleGetCommandCatalogue(conn: BspConnection): Promise<string> {
  const data = await bspGet<{ commands: unknown[] }>('/commands', conn);
  if (!data.commands.length) return 'No commands available at this endpoint.';
  return JSON.stringify(data.commands, null, 2);
}

async function handleGetCommandSchema(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bspGet<unknown>(`/commands/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

async function handleSendCommand(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
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

  const result = await bspPost<{ id: string }>('/commands', cloudEvent, conn);
  return `Command accepted. ID: ${result.id}`;
}

async function handleSendCommandAndWait(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
  const commandResult = await handleSendCommand(args, conn);

  const pollQuery = args.poll_query as string | undefined;
  if (!pollQuery) return commandResult;

  const pollParams = (args.poll_params ?? {}) as Record<string, unknown>;
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

async function handleGetQueryCatalogue(conn: BspConnection): Promise<string> {
  const data = await bspGet<{ queries: unknown[] }>('/queries', conn);
  if (!data.queries.length) return 'No queries available at this endpoint.';
  return JSON.stringify(data.queries, null, 2);
}

async function handleGetQuerySchema(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await bspGet<unknown>(`/queries/${schema}/${version}`, conn);
  return JSON.stringify(doc, null, 2);
}

async function handleExecuteQuery(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
  const schema = args.schema as string;
  const params = (args.params ?? {}) as Record<string, unknown>;

  const queryString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const path = queryString ? `/queries/${schema}?${queryString}` : `/queries/${schema}`;
  const result = await bspGet<unknown>(path, conn);
  return JSON.stringify(result, null, 2);
}

async function handleListServices(conn: BspConnection): Promise<string> {
  const data = await bspGet<{ services: unknown[] }>('/services', conn);
  if (!data.services || !data.services.length) return 'No services registered at this endpoint.';
  return JSON.stringify(data.services, null, 2);
}

async function handleGetService(args: Record<string, unknown>, conn: BspConnection): Promise<string> {
  const id = args.id as string;
  const service = await bspGet<unknown>(`/services/${encodeURIComponent(id)}`, conn);
  return JSON.stringify(service, null, 2);
}

// ── Server factory ────────────────────────────────────────────────────────────

const connectionSummary = MULTI
  ? `\n\n## Connections\n\nMultiple BSP connections are configured:\n` +
    CONNECTIONS.map(c =>
      `- **${c.name}**: ${c.endpoint}${c.description ? ` — ${c.description}` : ''}`
    ).join('\n') +
    `\n\nAlways specify the \`connection\` parameter on every tool call. ` +
    `If the user's request does not make it obvious which connection to use, ` +
    `call \`list_connections\` first and ask the user to confirm before proceeding.`
  : `\n\nConnected to: ${CONNECTIONS[0].endpoint}`;

const SERVER_INSTRUCTIONS = (`
You are connected to one or more BSP-compliant service endpoints.
${connectionSummary}

## Discovering running services

When the endpoint implements the io.bsp.agents.registry capability:

1. Call list_services to see all registered agent services and their current status.
2. Call get_service with a specific id to get full details (accepted commands, produced events, metadata).

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

## Error handling

If a command fails, relay the error message verbatim to the user — it is actionable.
`).trim();

function createMcpServer(): Server {
  const server = new Server(
    { name: 'bsp-mcp', version: '1.0.0' },
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

      // All other tools resolve their target connection from the optional 'connection' arg
      const conn = resolveConnection(safeArgs.connection as string | undefined);

      let text: string;
      switch (name) {
        case 'get_command_catalogue': text = await handleGetCommandCatalogue(conn);            break;
        case 'get_command_schema':    text = await handleGetCommandSchema(safeArgs, conn);     break;
        case 'send_command':          text = await handleSendCommand(safeArgs, conn);          break;
        case 'send_command_and_wait': text = await handleSendCommandAndWait(safeArgs, conn);   break;
        case 'get_query_catalogue':   text = await handleGetQueryCatalogue(conn);              break;
        case 'get_query_schema':      text = await handleGetQuerySchema(safeArgs, conn);       break;
        case 'execute_query':         text = await handleExecuteQuery(safeArgs, conn);         break;
        case 'list_services':         text = await handleListServices(conn);                   break;
        case 'get_service':           text = await handleGetService(safeArgs, conn);           break;
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
      const server = createMcpServer();

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
    process.stderr.write(`[bsp-mcp] HTTP server listening on port ${HTTP_PORT}\n`);
    process.stderr.write(`[bsp-mcp] MCP endpoint: http://localhost:${HTTP_PORT}/mcp\n`);
    for (const c of CONNECTIONS) {
      process.stderr.write(`[bsp-mcp] Connection '${c.name}': ${c.endpoint}\n`);
    }
  });
} else {
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
}
