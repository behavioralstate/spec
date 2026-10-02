/**
 * Smoke test for best-mcp: the real server over stdio, driven by the MCP SDK's client, against an
 * in-process mock BEST service.
 *
 *   modern — a service that states spec 0.9.11: agent registration through deviceAuthorizationUrl,
 *            commandType in the catalogue, application/cloudevents+json on POST /commands.
 *   legacy — a service that states 0.9.8 and declares none of it: the PascalCase fallback,
 *            application/json, and register_agent saying what to do instead.
 *   named  — nothing configured: "sign me in <name>, start from <manifest>" stores the credential under
 *            that name, the name is the connection (now and after a restart), and another name is
 *            another sign-in — even on the same host.
 *   hosted — over HTTP best-mcp is a server shared by every caller: it offers no sign-in, refuses one,
 *            and never loads a stored key, so no caller can ever act as another.
 *   one account, two entries — a configured app and a named sign-in of the same account (another
 *            assistant's) are one credential: a replaced configured key heals from the stored sign-in on
 *            its first 401 and the next start needs no 401 at all; a key issued on the named entry lands
 *            on the configured app too; a key ANOTHER process writes into the shared file while this one
 *            runs is found on the first 401, no restart. (A real two-assistant replay, 2026-10-02.)
 *
 * What must hold: the device code and the issued key never appear in a tool result; the key is stored;
 * the next call already uses it.
 *
 * Run: npm test   (builds first)
 */
import { createServer } from 'http';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');
// SPEC Agent Registration (0.9.17): the connection's name as the device request carries it
const oneWord = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'best';
const DEVICE_CODE = 'GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS';
const ISSUED_KEY = 'key_5f2c9a_issued_by_the_mock';
// Stand-ins for the spec's sign-in guidance: written for a consumer that signs in by hand, never for best-mcp's model.
const MANIFEST_GUIDANCE = 'BY-HAND SIGN-IN: POST a form to deviceAuthorizationUrl yourself';
const DEVICE_GUIDANCE = 'BY-HAND POLLING: poll tokenUrl yourself';

function mock(mode, { key: initialKey = ISSUED_KEY, tenants = false, tenantFailures = 0, foreignEndpoint = '', strictKey = false } = {}) {
  const modern = mode === 'modern';
  // `seen.key` is the account's ONE key: a scenario replaces it to play "another assistant was approved".
  const seen = { posts: [], tokenPolls: 0, deviceRequests: [], key: initialKey };
  const key = () => seen.key;
  let origin = '';
  const server = createServer((req, res) => {
    const path = new URL(req.url, origin).pathname;
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      if (path === '/.well-known/best') {
        return json(200, { best: {
          version: modern ? '0.9.11' : '0.9.8',
          authentication: { type: 'apiKey', scheme: 'X-Api-Key', in: 'header',
            ...(modern ? { tokenUrl: `${origin}/auth/token`, deviceAuthorizationUrl: `${origin}/auth/device`, note: MANIFEST_GUIDANCE } : {}) },
          services: { 'com.example.app': { version: '1.0.0', description: 'The example application.', http: { endpoint: `${origin}/api${tenants ? '/tenants' : ''}` } } },
          ...(tenants ? { tenants: { manifest: `${origin}/.well-known/best/{tenantId}` } } : {}),
          capabilities: []
        } });
      }
      if (tenants && path === '/.well-known/best/acme') {
        if (req.headers['x-api-key'] !== key()) return json(401, { error: { code: 'UNAUTHORIZED', message: 'key required' } });
        seen.tenantManifestGets = (seen.tenantManifestGets ?? 0) + 1;
        if (seen.tenantManifestGets <= tenantFailures) return json(503, { error: { code: 'UNAVAILABLE', message: 'try again' } });
        return json(200, { best: { version: '0.9.11', services: { 'com.example.app': { version: '1.0.0', description: 'The example application.', http: { endpoint: foreignEndpoint || `${origin}/api/tenants/acme` } } }, capabilities: [] } });
      }
      if (path === '/auth/device' && req.method === 'POST') {
        seen.deviceRequests.push(Object.fromEntries(new URLSearchParams(raw)));
        return json(200, { device_code: DEVICE_CODE, user_code: 'WDJB-MJHT', verification_uri: 'https://example.com/activate', verification_uri_complete: 'https://example.com/activate?code=WDJB-MJHT', expires_in: 900, interval: 1, note: DEVICE_GUIDANCE });
      }
      if (path === '/auth/token' && req.method === 'POST') {
        const form = new URLSearchParams(raw);
        if (form.get('device_code') !== DEVICE_CODE) return json(400, { error: 'invalid_grant' });
        seen.tokenPolls++;
        if (seen.tokenPolls === 1) return json(400, { error: 'authorization_pending', interval: 1 });
        return json(200, { access_token: key(), token_type: 'apikey', auth_header: 'X-Api-Key', tenant_id: 'acme', echo: `your key is ${key()}`,
          endpoint: `${origin}/api/tenants/acme`, note: 'The key is a SECRET. Store it and never repeat it in the conversation.',
          mcp: { mcpServers: { example: { command: 'npx', args: ['-y', '@behavioralstate/best-mcp'], env: { BEST_EXAMPLE_API_KEY: key() } } } },
          http: { header: 'X-Api-Key: <access_token>' } });
      }
      if (path === '/api/commands' && req.method === 'GET') {
        return json(200, { commands: [{ schema: 'place-order', version: '1.0', ...(modern ? { commandType: 'PlaceAnOrderV1' } : {}), dataschema: `${origin}/api/commands/place-order/1.0`, description: 'Place an order.' }] });
      }
      if (path.endsWith('/commands') && req.method === 'POST') {
        const body = JSON.parse(raw);
        seen.posts.push({ path, contentType: req.headers['content-type'], type: body.type, key: req.headers['x-api-key'] });
        if (strictKey && req.headers['x-api-key'] !== key()) return json(401, { error: { code: 'INVALID_API_KEY', message: 'That X-Api-Key is not a key of this tenant.' } });
        return json(201, { id: body.id, correlationId: body.id });
      }
      if (path.endsWith('/commands') && req.method === 'GET') return json(200, { commands: [] });
      return json(404, { error: { code: 'NOT_FOUND', message: `Unknown route ${path}` } });
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, origin, seen });
  }));
}

async function connect(origin, credentialsFile) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER],
    env: { ...process.env, BEST_EXAMPLE_BASE_URL: `${origin}/api`, BEST_MCP_CREDENTIALS_FILE: credentialsFile, MCP_TRANSPORT: 'stdio' },
    stderr: 'ignore'
  });
  const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

// A configured app with more than the base URL: the entry a service's token answer makes a client write.
async function connectApp(origin, credentialsFile, extraEnv) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER],
    env: { ...process.env, BEST_EXAMPLE_BASE_URL: `${origin}/api`, BEST_MCP_CREDENTIALS_FILE: credentialsFile, MCP_TRANSPORT: 'stdio', ...extraEnv },
    stderr: 'ignore'
  });
  const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

// Nothing configured at all: no BEST_* / BSP_* variable reaches the server.
async function connectBare(credentialsFile, extraEnv = { BEST_MCP_ALLOW_LOCAL: 'true' }) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(BEST|BSP)_/.test(k)));
  const transport = new StdioClientTransport({
    command: process.execPath, args: [SERVER],
    env: { ...env, BEST_MCP_CREDENTIALS_FILE: credentialsFile, MCP_TRANSPORT: 'stdio', ...extraEnv },
    stderr: 'ignore'
  });
  const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

const call = async (client, name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.map(c => c.text).join('\n'), isError: !!r.isError };
};

const problems = [];
const expect = (ok, message) => { if (!ok) problems.push(message); };

// ── modern ───────────────────────────────────────────────────────────────────
{
  const { server, origin, seen } = await mock('modern');
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  const client = await connect(origin, credentialsFile);
  const connections = (await call(client, 'list_connections')).text;
  const platform = /"name":\s*"(example[^"]*)"/.exec(connections)?.[1] ?? 'example';

  // A connection's name says nothing about where it points, so the host is stated where a model chooses the tool.
  const tools = (await client.listTools()).tools;
  for (const name of ['register_agent', 'get_manifest']) {
    expect(tools.find(t => t.name === name)?.description.includes(origin), `modern: ${name} does not state the host it serves`);
  }
  expect(tools.find(t => t.name === 'send_command')?.inputSchema.properties.connection.description.includes(origin), 'modern: the connection parameter does not state the host it serves');
  expect((client.getInstructions() ?? '').includes(`serve ${origin}`), 'modern: the server instructions do not state the host');

  const reg = await call(client, 'register_agent', { connection: platform, agent_label: 'Smoke test on a laptop' });
  expect(!reg.isError, `modern: register_agent failed: ${reg.text}`);
  expect(reg.text.includes('WDJB-MJHT') && reg.text.includes('https://example.com/activate?code=WDJB-MJHT'), 'modern: register_agent did not return the code and the link');
  expect(!reg.text.includes(DEVICE_CODE), 'modern: register_agent LEAKED the device code to the model');
  expect(reg.text.includes('own browser') && reg.text.includes('Never open it yourself'), `modern: register_agent does not say the person opens the link in their own browser: ${reg.text}`);
  expect(!reg.text.includes(DEVICE_GUIDANCE), `modern: the device answer's by-hand guidance reached the model: ${reg.text}`);
  const manifest = await call(client, 'get_manifest', { connection: platform });
  expect(!manifest.isError && manifest.text.includes('deviceAuthorizationUrl') && !manifest.text.includes(MANIFEST_GUIDANCE), `modern: get_manifest handed the model the by-hand sign-in guidance: ${manifest.text.slice(0, 400)}`);
  expect(seen.deviceRequests[0]?.client_id === 'best-mcp' && seen.deviceRequests[0]?.agent_label === 'Smoke test on a laptop', `modern: device request carried ${JSON.stringify(seen.deviceRequests[0])}`);
  expect(seen.deviceRequests[0]?.connection === oneWord(platform), `modern: device request did not carry the connection's name as one word (0.9.17): ${JSON.stringify(seen.deviceRequests[0])}`);

  const pending = await call(client, 'exchange_device_code', { connection: platform });
  expect(pending.text.includes('authorization_pending') && !pending.isError, `modern: first exchange should be pending, got: ${pending.text}`);
  const done = await call(client, 'exchange_device_code', { connection: platform });
  expect(!done.isError && done.text.includes('acme'), `modern: second exchange should succeed, got: ${done.text}`);
  expect(!done.text.includes(ISSUED_KEY), 'modern: exchange_device_code LEAKED the issued key to the model');
  expect(!done.text.includes('mcpServers') && !done.text.includes('"http"') && !done.text.includes('SECRET'), `modern: the credential block's mcp/http/note reached the model — best-mcp is already the client: ${done.text}`);
  expect(existsSync(credentialsFile) && readFileSync(credentialsFile, 'utf-8').includes(ISSUED_KEY), 'modern: the issued key was not stored');
  const again = await call(client, 'exchange_device_code', { connection: platform });
  expect(again.isError && again.text.includes('register_agent'), `modern: a redeemed registration should be gone, got: ${again.text}`);

  const after = (await call(client, 'list_connections')).text;
  const tenant = /"name":\s*"(example\/tenant)"/.exec(after)?.[1];
  expect(!!tenant, `modern: no tenant connection after registration: ${after}`);
  const sent = await call(client, 'send_command', { connection: tenant ?? platform, schema: 'place-order', version: '1.0', data: { sku: 'A1' } });
  expect(!sent.isError, `modern: send_command failed: ${sent.text}`);
  const post = seen.posts.at(-1);
  expect(post?.contentType === 'application/cloudevents+json', `modern: POST content type was ${post?.contentType}`);
  expect(post?.key === ISSUED_KEY, 'modern: the command did not carry the issued key');
  expect(post?.path === '/api/tenants/acme/commands', `modern: the command went to ${post?.path}`);
  await client.close(); server.close();
}

// ── modern, the catalogue states commandType ─────────────────────────────────
{
  const { server, origin, seen } = await mock('modern');
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  const client = await connect(origin, credentialsFile);
  const sent = await call(client, 'send_command', { schema: 'place-order', version: '1.0', data: {} });
  expect(!sent.isError && seen.posts.at(-1)?.type === 'PlaceAnOrderV1', `commandType: envelope type was ${seen.posts.at(-1)?.type} (${sent.text})`);
  await client.close(); server.close();
}

// ── legacy ───────────────────────────────────────────────────────────────────
{
  const { server, origin, seen } = await mock('legacy');
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  const client = await connect(origin, credentialsFile);
  const reg = await call(client, 'register_agent', {});
  expect(!reg.isError && reg.text.includes('no_device_authorization_endpoint'), `legacy: register_agent should explain, got: ${reg.text}`);
  expect(seen.deviceRequests.length === 0, 'legacy: a device request was sent to a service that declares no endpoint');
  const sent = await call(client, 'send_command', { schema: 'place-order', version: '1.0', data: {} });
  const post = seen.posts.at(-1);
  expect(!sent.isError && post?.type === 'PlaceOrder', `legacy: envelope type was ${post?.type} (${sent.text})`);
  expect(post?.contentType === 'application/json', `legacy: POST content type was ${post?.contentType}`);
  await client.close(); server.close();
}

// ── named — "sign me in <name>, start from <manifest>" ─────────────────────
{
  const a = await mock('modern', { key: 'key_for_whatever', tenants: true });
  const b = await mock('modern', { key: 'key_for_ciccio', tenants: true });
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  const stored = () => JSON.parse(readFileSync(credentialsFile, 'utf-8'));
  let client = await connectBare(credentialsFile);
  expect((client.getInstructions() ?? '').includes('register_agent'), 'named: with nothing configured the instructions do not say how to sign in');
  const none = await call(client, 'send_command', { schema: 'place-order', version: '1.0', data: {} });
  expect(none.isError && none.text.includes('register_agent'), `named: with no connection, a call should point at register_agent, got: ${none.text}`);

  // sign in under a name, then under another name somewhere else
  const signIn = async (name, manifest, mockOf) => {
    const reg = await call(client, 'register_agent', { name, manifest, agent_label: 'Smoke test' });
    expect(!reg.isError && reg.text.includes('WDJB-MJHT') && reg.text.includes(`${mockOf.origin}/.well-known/best`), `named: register_agent '${name}' failed: ${reg.text}`);
    expect(mockOf.seen.deviceRequests.at(-1)?.connection === oneWord(name), `named: register_agent '${name}' did not send the connection's name as one word (0.9.17): ${JSON.stringify(mockOf.seen.deviceRequests.at(-1))}`);
    expect(!reg.text.includes(DEVICE_CODE), `named: register_agent '${name}' LEAKED the device code`);
    let done;
    for (let i = 0; i < 3; i++) {
      done = await call(client, 'exchange_device_code', { connection: name });
      if (done.isError || !done.text.includes('authorization_pending')) break;
    }
    expect(!done.isError && done.text.includes(`"stored_under": "${name}"`), `named: exchange for '${name}' failed: ${done.text}`);
    return done;
  };
  const w = await signIn('whatever', `${a.origin}/.well-known/best`, a);
  expect(!w.text.includes('key_for_whatever'), 'named: exchange LEAKED the issued key');
  expect(!w.text.includes('mcpServers') && !w.text.includes('"http"') && !w.text.includes('SECRET'), `named: the credential block's mcp/http/note reached the model: ${w.text}`);
  await signIn('ciccio-live', `${b.origin}/.well-known/best`, b);
  await signIn('whatever-2', `${a.origin}/`, a);   // same host, another name; a bare origin means its well-known path

  const s = stored();
  expect(s.whatever?.manifest === `${a.origin}/.well-known/best` && s.whatever?.apiKey === 'key_for_whatever', `named: 'whatever' stored as ${JSON.stringify(s.whatever)}`);
  expect(s.whatever?.endpoints?.['com.example.app'] === `${a.origin}/api/tenants/acme`, `named: 'whatever' did not resolve the tenant manifest's endpoint: ${JSON.stringify(s.whatever?.endpoints)}`);
  expect(s['ciccio-live']?.manifest === `${b.origin}/.well-known/best` && s['ciccio-live']?.apiKey === 'key_for_ciccio', `named: 'ciccio-live' stored as ${JSON.stringify(s['ciccio-live'])}`);
  expect(!!s['whatever-2'] && s['whatever-2'].manifest === s.whatever?.manifest, 'named: a second name on the same host is not its own entry');

  const sentA = await call(client, 'send_command', { connection: 'whatever', schema: 'place-order', version: '1.0', data: {} });
  expect(!sentA.isError && a.seen.posts.at(-1)?.path === '/api/tenants/acme/commands' && a.seen.posts.at(-1)?.key === 'key_for_whatever', `named: 'whatever' did not reach its service with its key: ${sentA.text} ${JSON.stringify(a.seen.posts.at(-1))}`);

  // a name already signed in elsewhere is refused, and nothing is sent
  const before = b.seen.deviceRequests.length;
  const taken = await call(client, 'register_agent', { name: 'whatever', manifest: `${b.origin}/.well-known/best` });
  expect(!taken.isError && taken.text.includes('name_in_use') && b.seen.deviceRequests.length === before, `named: moving a held name must be refused without replace, got: ${taken.text}`);
  const bad = await call(client, 'register_agent', { name: 'a/b', manifest: `${b.origin}/.well-known/best` });
  expect(bad.isError, 'named: a name with "/" must be refused');

  // get_manifest on a named connection reads the manifest it signed in at, and its tenant manifest with its key
  const man = await call(client, 'get_manifest', { connection: 'whatever' });
  expect(!man.isError && man.text.includes('"scope": "tenant"') && man.text.includes(`${a.origin}/.well-known/best/acme`), `named: get_manifest did not read the tenant manifest: ${man.text.slice(0, 300)}`);
  await client.close();

  // a restart: the stored names ARE the connections
  client = await connectBare(credentialsFile);
  const listed = (await call(client, 'list_connections')).text;
  for (const n of ['whatever', 'ciccio-live', 'whatever-2']) expect(listed.includes(`"name": "${n}"`), `named: '${n}' is not a connection after a restart: ${listed}`);
  const sentB = await call(client, 'send_command', { connection: 'ciccio-live', schema: 'place-order', version: '1.0', data: {} });
  expect(!sentB.isError && b.seen.posts.at(-1)?.key === 'key_for_ciccio', `named: after a restart 'ciccio-live' did not use its own key: ${sentB.text}`);
  await client.close(); a.server.close(); b.server.close();
}

// ── one account, two entries — a configured app and another assistant's named sign-in ─────
{
  const m = await mock('modern', { key: 'key_live', tenants: true, strictKey: true });
  const sha = v => createHash('sha256').update(v).digest('hex');
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  const stored = () => JSON.parse(readFileSync(credentialsFile, 'utf-8'));
  // Another assistant signed in to this account under a name and holds the account's live key.
  writeFileSync(credentialsFile, JSON.stringify({ 'acme-live': {
    tenantId: 'acme', apiKey: 'key_live', authType: 'apikey', authHeader: 'X-Api-Key', issuedAt: '2026-10-02T21:28:55.990Z',
    manifest: `${m.origin}/.well-known/best`, endpoints: { 'com.example.app': `${m.origin}/api/tenants/acme` } } }));
  // This client's configured key was replaced by that approval: dead, and nobody edited its configuration.
  const dead = { BEST_EXAMPLE_API_KEY: 'key_dead', BEST_EXAMPLE_TENANT_ID: 'acme', BEST_EXAMPLE_AUTH_TYPE: 'apikey', BEST_MCP_ALLOW_LOCAL: 'true' };
  let client = await connectApp(m.origin, credentialsFile, dead);
  const listed = (await call(client, 'list_connections')).text;
  expect(listed.includes('"name": "acme-live"') && listed.includes("the same account as 'example/tenant'"), `one account: the named entry does not say it is the configured account: ${listed}`);
  const healed = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(!healed.isError && m.seen.posts.at(-1)?.key === 'key_live', `one account: the dead configured key did not heal from the stored sign-in: ${healed.text}`);
  expect(m.seen.posts.filter(p => p.key === 'key_dead').length === 1, `one account: the configured key should be tried exactly once, was ${m.seen.posts.filter(p => p.key === 'key_dead').length}`);
  expect(!healed.text.includes('key_live'), 'one account: healing LEAKED the adopted key');
  const s1 = stored();
  expect(s1[`${m.origin}/api`]?.apiKey === 'key_live' && s1[`${m.origin}/api`]?.supersededKeyHash === sha('key_dead'), `one account: the app's entry was not written for the next start: ${JSON.stringify(s1[`${m.origin}/api`])}`);
  await client.close();

  // The next start, same dead configuration: the store fills in and the dead key is never sent again.
  client = await connectApp(m.origin, credentialsFile, dead);
  let before = m.seen.posts.length;
  const quiet = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(!quiet.isError && m.seen.posts.slice(before).every(p => p.key === 'key_live'), `one account: after a restart the dead configured key was sent again: ${JSON.stringify(m.seen.posts.slice(before))}`);

  // Now the account's key is replaced AGAIN elsewhere: both stored copies are dead, and a sign-in on the
  // NAMED connection must repair the configured app too — in this session and at the next start.
  m.seen.key = 'key_live2';
  const both = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(both.isError && both.text.includes('INVALID_API_KEY'), `one account: with every copy dead the call should fail honestly, got: ${both.text}`);
  m.seen.tokenPolls = 0;
  const reg = await call(client, 'register_agent', { connection: 'acme-live', agent_label: 'Smoke test' });
  expect(!reg.isError && reg.text.includes('WDJB-MJHT'), `one account: register_agent on the named connection failed: ${reg.text}`);
  let done;
  for (let i = 0; i < 3; i++) {
    done = await call(client, 'exchange_device_code', { connection: 'acme-live' });
    if (done.isError || !done.text.includes('authorization_pending')) break;
  }
  expect(!done.isError && done.text.includes('"stored_under": "acme-live"'), `one account: exchange on the named connection failed: ${done.text}`);
  before = m.seen.posts.length;
  const viaApp = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(!viaApp.isError && m.seen.posts.slice(before).every(p => p.key === 'key_live2'), `one account: the key issued on the named entry did not reach the configured app in this session: ${JSON.stringify(m.seen.posts.slice(before))}`);
  const s2 = stored();
  expect(s2['acme-live']?.apiKey === 'key_live2' && s2[`${m.origin}/api`]?.apiKey === 'key_live2' && s2[`${m.origin}/api`]?.supersededKeyHash === sha('key_dead'), `one account: the issued key was not written to both entries naming the configured key as superseded: ${JSON.stringify(s2)}`);
  await client.close();

  client = await connectApp(m.origin, credentialsFile, dead);
  before = m.seen.posts.length;
  const next = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(!next.isError && m.seen.posts.slice(before).every(p => p.key === 'key_live2'), `one account: at the next start the configured app did not carry the key issued on the named entry: ${JSON.stringify(m.seen.posts.slice(before))}`);

  // While this process runs, ANOTHER assistant's best-mcp is approved and writes the account's new key
  // into the shared file: this process has never seen it, and must find it on its first 401 — on the
  // configured app and on the named connection alike — without a restart and without asking anyone.
  m.seen.key = 'key_live3';
  const s3 = stored();
  s3['acme-live'] = { ...s3['acme-live'], apiKey: 'key_live3', issuedAt: new Date().toISOString() };
  writeFileSync(credentialsFile, JSON.stringify(s3));
  before = m.seen.posts.length;
  const live = await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
  expect(!live.isError && m.seen.posts.at(-1)?.key === 'key_live3', `one account: a key another process wrote was not picked up by the configured app without a restart: ${live.text}`);
  const named = await call(client, 'send_command', { connection: 'acme-live', schema: 'place-order', version: '1.0', data: {} });
  expect(!named.isError && m.seen.posts.at(-1)?.key === 'key_live3', `one account: the named connection kept its stale in-memory key after another process refreshed its entry: ${named.text}`);
  expect(m.seen.posts.slice(before).filter(p => p.key !== 'key_live3').length === 1, `one account: the stale key should be tried once, then never again: ${JSON.stringify(m.seen.posts.slice(before))}`);
  expect(stored()[`${m.origin}/api`]?.apiKey === 'key_live3', 'one account: the app entry was not refreshed from the other process\'s key');
  await client.close(); m.server.close();
}

// ── named, hardening — local addresses, foreign endpoints, a failed discovery ───
{
  const c = await mock('modern', { key: 'key_for_retry', tenants: true, tenantFailures: 1 });
  const d = await mock('modern', { key: 'key_for_foreign', tenants: true, foreignEndpoint: 'https://elsewhere.example/api/tenants/acme' });
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');

  // outside development use a loopback address is refused, and nothing is sent
  let client = await connectBare(credentialsFile, {});
  const before = c.seen.deviceRequests.length;
  const local = await call(client, 'register_agent', { name: 'local', manifest: `${c.origin}/.well-known/best` });
  expect(local.isError && local.text.includes('development') && c.seen.deviceRequests.length === before, `named: a loopback manifest was not refused outside development use: ${local.text}`);
  await client.close();

  client = await connectBare(credentialsFile);
  const signIn = async (name, mockOf) => {
    await call(client, 'register_agent', { name, manifest: `${mockOf.origin}/.well-known/best` });
    let done;
    for (let i = 0; i < 3; i++) { done = await call(client, 'exchange_device_code', { connection: name }); if (done.isError || !done.text.includes('authorization_pending')) break; }
    return done;
  };
  // a failed discovery keeps the credential; the next use completes it — no second approval
  const retry = await signIn('retry', c);
  expect(!retry.isError && retry.text.includes('could not be resolved yet') && JSON.parse(readFileSync(credentialsFile, 'utf-8')).retry?.apiKey === 'key_for_retry', `named: a failed discovery lost the credential: ${retry.text}`);
  const approvals = c.seen.deviceRequests.length;
  const used = await call(client, 'send_command', { connection: 'retry', schema: 'place-order', version: '1.0', data: {} });
  expect(!used.isError && c.seen.posts.at(-1)?.key === 'key_for_retry' && c.seen.deviceRequests.length === approvals, `named: the next use did not complete the sign-in: ${used.text}`);

  // an endpoint on another host never gets the credential
  const foreign = await signIn('foreign', d);
  expect(foreign.text.includes('another host'), `named: an endpoint on another host was accepted: ${foreign.text}`);
  const refused = await call(client, 'send_command', { connection: 'foreign', schema: 'place-order', version: '1.0', data: {} });
  expect(refused.isError && refused.text.includes('another host'), `named: a connection to another host was usable: ${refused.text}`);
  await client.close(); c.server.close(); d.server.close();
}

// ── http — the endpoint is the origin itself; /mcp stays as an alias ────────
{
  const { server, origin } = await mock('modern');
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, BEST_EXAMPLE_BASE_URL: `${origin}/api`, MCP_TRANSPORT: 'http', MCP_HTTP_PORT: String(port) },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  const up = async () => { for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) return true; } catch {} await new Promise(r => setTimeout(r, 100)); } return false; };
  expect(await up(), 'http: the server did not come up');
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.0' } } };
  const post = path => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(initialize) });
  for (const path of ['/', '/mcp', '/mcp/', '/?session=abc']) {
    const r = await post(path);
    expect(r.status === 200, `http: POST ${path} answered ${r.status} — the MCP endpoint must be the origin itself, with /mcp as the alias`);
    await r.body?.cancel();
  }
  expect((await post('/elsewhere')).status === 404, 'http: an unknown path must be 404, not the MCP endpoint');
  expect((await fetch(`${base}/health`)).status === 200, 'http: /health must keep answering');
  child.kill(); server.close();
}

// ── hosted — a server signs no one in and lends no one's key ────────────────
{
  const { server, origin, seen } = await mock('modern');
  const port = await new Promise(resolve => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }); });
  const credentialsFile = join(mkdtempSync(join(tmpdir(), 'best-mcp-smoke-')), 'credentials.json');
  // A key left in the store (a sign-in by an earlier version, a mounted file) must answer no one.
  const leftover = JSON.stringify({ [`${origin}/api`]: { apiKey: 'someone_elses_key', authType: 'apikey', tenantId: 'acme', issuedAt: '2026-01-01T00:00:00Z' } });
  writeFileSync(credentialsFile, leftover);
  // A hosted MCP whose operator also configured a REAL key: over HTTP it must answer no one.
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, MCP_TRANSPORT: 'http', MCP_HTTP_PORT: String(port), BEST_MCP_CREDENTIALS_FILE: credentialsFile,
      BEST_EXAMPLE_BASE_URL: `${origin}/api`, BEST_EXAMPLE_API_KEY: 'the_operators_own_key', BEST_EXAMPLE_TENANT_ID: 'acme' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${base}/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  for (const headers of [{}, { 'X-Api-Key': 'a-callers-own-key', 'X-Tenant-Id': 'acme' }]) {
    const who = Object.keys(headers).length ? 'a per-request caller' : 'an anonymous caller';
    const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers } }));
    const names = (await client.listTools()).tools.map(t => t.name);
    expect(!names.includes('register_agent') && !names.includes('exchange_device_code'), `hosted: sign-in tools are offered to ${who}: ${names.join(', ')}`);
    expect(!(client.getInstructions() ?? '').includes('Call register_agent'), `hosted: the instructions tell ${who} to sign in here`);
    const named = await call(client, 'register_agent', { name: 'whatever', manifest: `${origin}/.well-known/best` });
    expect(named.isError && named.text.includes('holds no credential'), `hosted: a sign-in under a name was not refused for ${who}: ${named.text}`);
    const reg = await call(client, 'register_agent', { connection: 'example/platform' });
    expect(reg.isError && reg.text.includes('holds no credential'), `hosted: register_agent was not refused for ${who}: ${reg.text}`);
    const byHand = await call(client, 'exchange_device_code', { connection: 'example/platform', device_code: DEVICE_CODE });
    expect(byHand.isError && !byHand.text.includes(ISSUED_KEY), `hosted: exchange_device_code was not refused for ${who}: ${byHand.text}`);
    await client.close();
  }
  expect(seen.deviceRequests.length === 0 && seen.tokenPolls === 0, 'hosted: a sign-in reached the service from a server');
  expect(readFileSync(credentialsFile, 'utf-8') === leftover, 'hosted: the server wrote to the credential store');
  {
    const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(base)));
    await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
    expect(seen.posts.at(-1)?.key === undefined, `hosted: an anonymous call carried ${seen.posts.at(-1)?.key} — neither a stored nor a configured key may answer a caller without one`);
    await client.close();
  }
  {
    const client = new Client({ name: 'best-mcp-smoke', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { 'X-Api-Key': 'a-callers-own-key', 'X-Tenant-Id': 'acme' } } }));
    await call(client, 'send_command', { connection: 'example/tenant', schema: 'place-order', version: '1.0', data: {} });
    expect(seen.posts.at(-1)?.key === 'a-callers-own-key', `hosted: a caller's own key was not the one sent (${seen.posts.at(-1)?.key})`);
    await client.close();
  }
  child.kill(); server.close();
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('smoke: registration keeps both secrets from the model, stores the key and uses it; a sign-in under a name is stored under that name and is that connection, after a restart too; commandType and the content type follow the manifest; a legacy service is handled; over HTTP the endpoint is the origin itself, and a server signs no one in and lends no stored or configured key; the entries of one account are one credential — a replaced configured key heals from a stored sign-in and a key issued on either reaches both');
