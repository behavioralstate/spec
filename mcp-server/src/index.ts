#!/usr/bin/env node
/**
 * oap-mcp — MCP server for any OAP-compliant endpoint
 *
 * Exposes the OAP command and query surface as MCP tools so any LLM client
 * can discover, read, and send commands to an OAP-compliant service.
 *
 * Configuration (environment variables):
 *   OAP_ENDPOINT   — Base URL of the OAP HTTP endpoint (required)
 *                    Point this at the root of the OAP surface, e.g.:
 *                      https://api.example.com/oap
 *                      https://dotquant.io/api/oap/tenants/<tenantId>
 *   OAP_API_KEY    — API key sent as "Authorization: Bearer <key>" (required)
 *   MCP_TRANSPORT  — "stdio" (default) or "http"
 *   MCP_HTTP_PORT  — HTTP port when MCP_TRANSPORT=http (default: 3000)
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

// ── Config ────────────────────────────────────────────────────────────────────

const ENDPOINT = (process.env.OAP_ENDPOINT ?? '').replace(/\/$/, '');
const API_KEY  = process.env.OAP_API_KEY ?? '';
const TRANSPORT  = process.env.MCP_TRANSPORT ?? 'stdio';
const HTTP_PORT  = parseInt(process.env.MCP_HTTP_PORT ?? '3000', 10);

const missing: string[] = [];
if (!ENDPOINT) missing.push('OAP_ENDPOINT');
if (!API_KEY)  missing.push('OAP_API_KEY');
if (missing.length) {
  process.stderr.write(`[oap-mcp] ERROR: missing required environment variables: ${missing.join(', ')}\n`);
  process.exit(1);
}

// Disable TLS verification for localhost dev servers (e.g. self-signed Vite cert)
if (/^https:\/\/localhost(:\d+)?/.test(ENDPOINT)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  process.stderr.write('[oap-mcp] WARNING: TLS verification disabled for localhost\n');
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

async function oapGet<T>(path: string): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' }
  });
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function oapPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
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

const TOOLS: Tool[] = [
  {
    name: 'get_command_catalogue',
    description:
      'List all commands this OAP endpoint accepts. ' +
      'Returns the command catalogue: every command type with its schema name, version, dataschema URI, and description. ' +
      'Call this first to discover what you can send. ' +
      'Examples: configure-broker, configure-indicator-alert, submit-signal, archive-broker.',
    inputSchema: { type: 'object', properties: {}, required: [] }
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
      'Send a command to the OAP endpoint. ' +
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
    name: 'get_query_catalogue',
    description:
      'List all read queries available at this OAP endpoint. ' +
      'Returns the query catalogue: every query type with its schema name, version, dataschema URI, and description. ' +
      'Call this to discover what current-state data you can read. ' +
      'Examples: list-brokers (get configured broker accounts), list-alerts (get configured alerts), list-price-feeds (get configured price feeds).',
    inputSchema: { type: 'object', properties: {}, required: [] }
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
      'Execute a read query against the OAP endpoint and return current state data synchronously. ' +
      'Use get_query_catalogue to discover available queries, ' +
      'then get_query_schema to learn the accepted parameters and response shape, ' +
      'then call this with the schema name and any parameters. ' +
      'Example: execute list-brokers to get IDs needed for a subsequent send_command call.',
    inputSchema: {
      type: 'object',
      properties: {
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
  }
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleGetCommandCatalogue(): Promise<string> {
  const data = await oapGet<{ commands: unknown[] }>('/commands');
  if (!data.commands.length) return 'No commands available at this endpoint.';
  return JSON.stringify(data.commands, null, 2);
}

async function handleGetCommandSchema(args: Record<string, unknown>): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await oapGet<unknown>(`/commands/${schema}/${version}`);
  return JSON.stringify(doc, null, 2);
}

async function handleSendCommand(args: Record<string, unknown>): Promise<string> {
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

  const result = await oapPost<{ id: string }>('/commands', cloudEvent);
  return `Command accepted. ID: ${result.id}`;
}

async function handleGetQueryCatalogue(): Promise<string> {
  const data = await oapGet<{ queries: unknown[] }>('/queries');
  if (!data.queries.length) return 'No queries available at this endpoint.';
  return JSON.stringify(data.queries, null, 2);
}

async function handleGetQuerySchema(args: Record<string, unknown>): Promise<string> {
  const schema  = args.schema as string;
  const version = args.version as string;
  const doc = await oapGet<unknown>(`/queries/${schema}/${version}`);
  return JSON.stringify(doc, null, 2);
}

async function handleExecuteQuery(args: Record<string, unknown>): Promise<string> {
  const schema = args.schema as string;
  const params = (args.params ?? {}) as Record<string, unknown>;

  const queryString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  const path = queryString ? `/queries/${schema}?${queryString}` : `/queries/${schema}`;
  const result = await oapGet<unknown>(path);
  return JSON.stringify(result, null, 2);
}

// ── Server factory ────────────────────────────────────────────────────────────

const SERVER_INSTRUCTIONS = `
You are connected to an OAP-compliant service endpoint at ${ENDPOINT}.

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
`.trim();

function createMcpServer(): Server {
  const server = new Server(
    { name: 'oap-mcp', version: '1.0.0' },
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
      let text: string;
      switch (name) {
        case 'get_command_catalogue': text = await handleGetCommandCatalogue();         break;
        case 'get_command_schema':    text = await handleGetCommandSchema(safeArgs);    break;
        case 'send_command':          text = await handleSendCommand(safeArgs);         break;
        case 'get_query_catalogue':   text = await handleGetQueryCatalogue();           break;
        case 'get_query_schema':      text = await handleGetQuerySchema(safeArgs);      break;
        case 'execute_query':         text = await handleExecuteQuery(safeArgs);        break;
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
    process.stderr.write(`[oap-mcp] HTTP server listening on port ${HTTP_PORT}\n`);
    process.stderr.write(`[oap-mcp] MCP endpoint: http://localhost:${HTTP_PORT}/mcp\n`);
    process.stderr.write(`[oap-mcp] OAP endpoint: ${ENDPOINT}\n`);
  });
} else {
  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
}
