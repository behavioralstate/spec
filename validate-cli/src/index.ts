#!/usr/bin/env node
/**
 * best-validate — conformance validator for BEST (Behavioral State Protocol) endpoints.
 *
 * Runs the conformance checklist from the spec against a live endpoint:
 * discovery manifest (fetch + JSON Schema validation), capability declaration
 * rules, per-capability endpoint probes, multi-tenant root-manifest rules,
 * error format, and auth enforcement.
 *
 * From 0.9.11 it also checks Manifest Discipline (the manifest stays structure),
 * access declared versus access served, agent registration (RFC 8628) and the
 * single entry. Rules the spec states in 0.9.11 and requires from 0.10.0 are
 * reported as warnings until then.
 *
 * A plain run never writes anything: the only POSTs issued are a command with an
 * intentionally unknown type, which a conformant endpoint rejects before queuing,
 * and a token request with an intentionally unknown device code. The one probe
 * that creates something — a real, inert, self-expiring registration — runs only
 * with --probe-registration.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// ── CLI arguments ─────────────────────────────────────────────────────────────

interface Options {
  url: string;
  apiKey?: string;
  authType?: string;    // bearer | apikey | none (overrides manifest declaration)
  authHeader: string;
  authIn: string;       // header | query
  authParam: string;
  tenant?: string;
  json: boolean;
  timeoutMs: number;
  probeRegistration: boolean;
}

function usage(): never {
  process.stdout.write(`Usage: best-validate <endpoint-url> [options]

Validates a live endpoint against the BEST conformance checklist.

Options:
  --api-key <key>       Credential for authenticated endpoints.
  --auth-type <t>       bearer | apikey | none. Default: what the manifest declares.
  --auth-header <name>  Header name for apikey auth (default: X-Api-Key).
  --auth-in <where>     header | query (default: header).
  --auth-param <name>   Query parameter name when --auth-in query (default: apikey).
  --tenant <id>         Tenant ID for multi-tenant hosts — expands tenants.manifest
                        and validates the tenant manifest and its capabilities.
  --probe-registration  Also POST to authentication.deviceAuthorizationUrl and check the
                        RFC 8628 answer. Off by default: it is the validator's only write —
                        it opens a real, inert registration that expires by itself.
  --json                Machine-readable output.
  --timeout <ms>        Per-request timeout (default: 10000).
  -h, --help            This text.

Exit code: 0 when no checks fail (warnings allowed), 1 otherwise.
`);
  process.exit(0);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    url: '', authHeader: 'X-Api-Key', authIn: 'header',
    authParam: 'apikey', json: false, timeoutMs: 10000, probeRegistration: false
  };
  const take = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined) { process.stderr.write(`${flag} requires a value\n`); process.exit(2); }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': usage();
      case '--json': opts.json = true; break;
      case '--probe-registration': opts.probeRegistration = true; break;
      case '--api-key': opts.apiKey = take(i, a); i++; break;
      case '--auth-type': opts.authType = take(i, a); i++; break;
      case '--auth-header': opts.authHeader = take(i, a); i++; break;
      case '--auth-in': opts.authIn = take(i, a); i++; break;
      case '--auth-param': opts.authParam = take(i, a); i++; break;
      case '--tenant': opts.tenant = take(i, a); i++; break;
      case '--timeout': opts.timeoutMs = parseInt(take(i, a), 10); i++; break;
      default:
        if (a.startsWith('-')) { process.stderr.write(`Unknown option: ${a}\n`); process.exit(2); }
        if (opts.url) { process.stderr.write('Only one endpoint URL may be given\n'); process.exit(2); }
        opts.url = a;
    }
  }
  if (!opts.url) usage();
  return opts;
}

// ── Naming ────────────────────────────────────────────────────────────────────

const WELL_KNOWN = '/.well-known/best';
const ROOT_KEY = 'best';
const NS = 'io.best.';
const MODE_LABEL = 'BEST 0.9.11';

// Rules the spec states in 0.9.11 and requires from 0.10.0. Until then a violation is a warning.
const STAGED: Level = 'warn';
const STAGED_NOTE = ' — required from 0.10.0';
const DESCRIPTION_LIMIT = 500;
const PSEUDO_TENANTS = ['public', 'default', 'anonymous'];

// ── Check collection ──────────────────────────────────────────────────────────

type Level = 'pass' | 'warn' | 'fail' | 'skip';
interface Check { section: string; level: Level; message: string; detail?: string; }
const checks: Check[] = [];
function record(section: string, level: Level, message: string, detail?: string): void {
  checks.push({ section, level, message, detail });
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface Resp { status: number; contentType: string; text: string; json?: unknown; error?: string; }

interface HttpExtra { contentType?: string; form?: Record<string, string>; accept?: string; }

async function http(method: string, url: string, opts: Options, auth: AuthPlan | null, body?: unknown, extra: HttpExtra = {}): Promise<Resp> {
  const headers: Record<string, string> = { Accept: extra.accept ?? 'application/json' };
  let finalUrl = url;
  if (auth) {
    if (auth.type === 'bearer') headers['Authorization'] = `Bearer ${auth.key}`;
    else if (auth.type === 'apikey' && auth.in === 'header') headers[auth.header] = auth.key;
    else if (auth.type === 'apikey' && auth.in === 'query') {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${encodeURIComponent(auth.param)}=${encodeURIComponent(auth.key)}`;
    }
  }
  if (extra.form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  else if (body !== undefined) headers['Content-Type'] = extra.contentType ?? 'application/json';
  try {
    const res = await fetch(finalUrl, {
      method, headers,
      body: extra.form ? new URLSearchParams(extra.form).toString() : body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'follow',
      signal: AbortSignal.timeout(opts.timeoutMs)
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', text, json };
  } catch (e) {
    return { status: 0, contentType: '', text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

interface AuthPlan { type: string; key: string; header: string; in: string; param: string; }

function buildAuthPlan(opts: Options, manifestAuth: Record<string, unknown> | undefined): AuthPlan | null {
  const declaredType = typeof manifestAuth?.type === 'string' ? manifestAuth.type as string : 'none';
  const type = (opts.authType ?? declaredType).toLowerCase();
  if (type === 'none' || !opts.apiKey) return null;
  const scheme = typeof manifestAuth?.scheme === 'string' ? manifestAuth.scheme as string : undefined;
  return {
    type: type === 'apikey' ? 'apikey' : 'bearer',
    key: opts.apiKey,
    header: opts.authType ? opts.authHeader : (scheme && type === 'apikey' ? scheme : opts.authHeader),
    in: (typeof manifestAuth?.in === 'string' && !opts.authType ? manifestAuth.in as string : opts.authIn),
    param: opts.authParam
  };
}

// ── Schema loading ────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '..', 'schemas');

function loadAjv(): Ajv2020 {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats.default ? addFormats.default(ajv) : (addFormats as unknown as (a: Ajv2020) => void)(ajv);
  for (const rel of ['cloudEvent.json', 'discovery.json', 'error.json', 'agents/commands.json', 'agents/events.json', 'agents/queries.json', 'agents/workflows.json']) {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, rel), 'utf-8'));
    ajv.addSchema(schema);
  }
  return ajv;
}

function ajvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? []).slice(0, 5)
    .map(e => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Dict : undefined;

function manifestRoot(manifest: unknown): Dict | undefined {
  return asDict(asDict(manifest)?.[ROOT_KEY]);
}

interface Capability { name: string; status: string; service?: string; dict: Dict; }

function capabilities(root: Dict): Capability[] {
  const arr = Array.isArray(root.capabilities) ? root.capabilities : [];
  return arr.map(c => asDict(c)).filter((c): c is Dict => !!c).map(c => ({
    name: String(c.name ?? ''),
    status: String(c.status ?? 'active'),
    service: typeof c.service === 'string' ? c.service : undefined,
    dict: c
  }));
}

/** Key of the service that implements a capability: explicit `service`, else prefix match, else the only service. */
function serviceKeyFor(cap: Capability, root: Dict): string | undefined {
  const services = asDict(root.services) ?? {};
  return cap.service
    ?? Object.keys(services).find(k => cap.name.startsWith(k + '.'))
    ?? (Object.keys(services).length === 1 ? Object.keys(services)[0] : undefined);
}

/** The authentication block that governs a service: its own, else the root's (0.9.11). */
function governingAuth(serviceKey: string | undefined, root: Dict): Dict | undefined {
  const services = asDict(root.services) ?? {};
  const own = serviceKey ? asDict(asDict(services[serviceKey])?.authentication) : undefined;
  return own ?? asDict(root.authentication);
}

const hasOwnAuth = (serviceKey: string | undefined, root: Dict): boolean =>
  !!(serviceKey && asDict(asDict((asDict(root.services) ?? {})[serviceKey])?.authentication));

/** Resolve the http endpoint base URL a capability's paths append to. */
function endpointFor(cap: Capability, root: Dict): string | undefined {
  const services = asDict(root.services) ?? {};
  const key = serviceKeyFor(cap, root);
  if (!key) return undefined;
  const httpBlock = asDict(asDict(services[key])?.http);
  const ep = httpBlock?.endpoint;
  return typeof ep === 'string' ? ep.replace(/\/+$/, '') : undefined;
}

const isAbsoluteUri = (s: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

// ── Probe sections ────────────────────────────────────────────────────────────

async function checkDiscovery(base: string, opts: Options, ajv: Ajv2020): Promise<Dict | undefined> {
  const S = 'discovery';
  const url = base + WELL_KNOWN;
  const res = await http('GET', url, opts, null);
  if (res.error || res.status === 0) { record(S, 'fail', `GET ${WELL_KNOWN} unreachable`, res.error); return undefined; }
  if (res.status !== 200) { record(S, 'fail', `GET ${WELL_KNOWN} returned ${res.status} — must be 200 without credentials`); return undefined; }
  record(S, 'pass', `GET ${WELL_KNOWN} → 200 without credentials`);

  if (!res.contentType.includes('application/json')) {
    record(S, 'warn', `Content-Type is "${res.contentType}" — must be application/json`);
  } else record(S, 'pass', 'Content-Type: application/json');

  if (res.json === undefined) { record(S, 'fail', 'Response body is not valid JSON'); return undefined; }

  const root = manifestRoot(res.json);
  if (!root) { record(S, 'fail', `Manifest root key "${ROOT_KEY}" missing`); return undefined; }
  record(S, 'pass', `Manifest root key "${ROOT_KEY}" present`);

  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/discovery.json');
  if (validate) {
    if (validate(res.json)) record(S, 'pass', 'Manifest validates against discovery.json');
    else record(S, 'fail', 'Manifest fails discovery.json validation', ajvErrors(validate));
  }

  if (typeof root.version === 'string' && /^\d+\.\d+\.\d+$/.test(root.version)) {
    record(S, 'pass', `Protocol version ${root.version}`);
  } else record(S, 'fail', 'Root "version" missing or not MAJOR.MINOR.PATCH');

  for (const cap of capabilities(root)) {
    if (cap.name.startsWith(NS)) {
      const missing = ['spec', 'schema'].filter(f => typeof cap.dict[f] !== 'string');
      if (missing.length) record(S, 'fail', `${cap.name}: missing required ${missing.join(', ')} URL(s) for ${NS}* capabilities`);
    }
    if (!['active', 'partial', 'planned'].includes(cap.status)) {
      record(S, 'fail', `${cap.name}: invalid status "${cap.status}"`);
    }
  }
  return root;
}

async function checkTenancy(root: Dict, base: string, opts: Options, ajv: Ajv2020): Promise<{ workingRoot: Dict; probeable: boolean }> {
  const S = 'multi-tenancy';
  const tenants = asDict(root.tenants);
  if (!tenants) { return { workingRoot: root, probeable: true }; }

  const template = typeof tenants.manifest === 'string' ? tenants.manifest : '';
  if (!template.includes('{tenantId}')) {
    record(S, 'fail', 'tenants.manifest present but has no {tenantId} variable');
    return { workingRoot: root, probeable: false };
  }
  record(S, 'pass', 'tenants.manifest URI template declared');

  // A root capability is lawful when the host can fulfil it without tenant context. From 0.9.11 a service
  // says so by carrying its own authentication block; without one the root block governs it, which is the
  // tenant credential — so the capability reads as tenant-scoped.
  const rootCaps = capabilities(root).filter(c =>
    [`${NS}agents.commands`, `${NS}agents.events`, `${NS}agents.queries`, `${NS}agents.workflows`].includes(c.name));
  const unscoped = rootCaps.filter(c => !hasOwnAuth(serviceKeyFor(c, root), root));
  if (unscoped.length) {
    record(S, STAGED, `Root manifest of a multi-tenant host declares capabilities on a service with no authentication block of its own: ${[...new Set(unscoped.map(c => serviceKeyFor(c, root) ?? c.name))].join(', ')} — a root-level surface declares its own authentication ("type": "none" when public); tenant-scoped capabilities belong in tenant manifests only${STAGED_NOTE}`);
  } else record(S, 'pass', rootCaps.length ? 'Root capabilities sit on services that declare their own authentication' : 'Root manifest declares no tenant-scoped capabilities');

  if (!opts.tenant) {
    record(S, 'skip', 'No --tenant given — tenant manifest and tenant capability probes skipped');
    return { workingRoot: root, probeable: false };
  }

  const url = template.replaceAll('{tenantId}', opts.tenant);
  const auth = buildAuthPlan(opts, asDict(root.authentication));
  const res = await http('GET', url, opts, auth);
  if (res.status !== 200 || res.json === undefined) {
    record(S, 'fail', `Tenant manifest fetch returned ${res.status || res.error}`);
    return { workingRoot: root, probeable: false };
  }
  record(S, 'pass', `Tenant manifest fetched (${opts.tenant})`);

  const raw = JSON.stringify(res.json);
  if (raw.includes('{tenantId}')) record(S, 'fail', 'Tenant manifest contains {tenantId} placeholders — must be fully resolved');
  else record(S, 'pass', 'Tenant manifest fully resolved (no placeholders)');

  const tRoot = manifestRoot(res.json);
  if (!tRoot) { record(S, 'fail', `Tenant manifest missing root key "${ROOT_KEY}"`); return { workingRoot: root, probeable: false }; }
  if (asDict(tRoot.tenants)) record(S, 'fail', 'Tenant manifest must not contain a tenants block');
  else record(S, 'pass', 'Tenant manifest has no tenants block');

  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/discovery.json');
  if (validate) {
    if (validate(res.json)) record(S, 'pass', 'Tenant manifest validates against discovery.json');
    else record(S, 'fail', 'Tenant manifest fails discovery.json validation', ajvErrors(validate));
  }
  return { workingRoot: tRoot, probeable: true };
}

async function checkCommands(cap: Capability, ep: string, ctx: ProbeContext, opts: Options, ajv: Ajv2020): Promise<void> {
  const { auth, authDeclared } = ctx;
  const S = 'commands';
  const res = await http('GET', `${ep}/commands`, opts, auth);
  if (!auth && authDeclared && res.status === 401) {
    record(S, 'pass', 'GET /commands → 401 without credentials (route exists, auth enforced) — pass --api-key for full validation');
    return;
  }
  if (res.status !== 200 || res.json === undefined) { record(S, 'fail', `GET /commands returned ${res.status || res.error}`); return; }
  const entries = (asDict(res.json)?.commands ?? []) as Dict[];
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/agents/commands.json#/$defs/commandCatalogue');
  if (validate && !validate(res.json)) record(S, 'fail', 'Command catalogue fails schema validation', ajvErrors(validate));
  else record(S, 'pass', 'GET /commands → 200, catalogue validates');
  for (const e of entries.slice(0, 20)) {
    const ds = String(e.dataschema ?? '');
    if (!isAbsoluteUri(ds)) {
      record(S, 'fail', `Catalogue entry "${e.schema}": dataschema "${ds}" is not an absolute URI`);
    }
  }
  if (entries.length && isAbsoluteUri(String(entries[0].dataschema ?? ''))) {
    record(S, 'pass', `Catalogue dataschema URIs are absolute (${entries.length} entries)`);
  }
  noteOperations(ctx, entries.map(e => String(e.schema ?? '')));
  checkVocabulary(S, 'command', entries.map(e => String(e.schema ?? '')));
  if (entries.length) {
    const without = entries.filter(e => typeof e.commandType !== 'string');
    if (without.length) record(S, 'warn', `${without.length} of ${entries.length} catalogue entries state no commandType — consumers must guess the envelope type from the schema name`);
    else record(S, 'pass', 'Every catalogue entry states its commandType');
  }

  if (entries.length) {
    const { schema, version } = entries[0] as { schema?: string; version?: string };
    const sRes = await http('GET', `${ep}/commands/${schema}/${version}`, opts, auth);
    if (sRes.status === 200 && sRes.json !== undefined) {
      record(S, 'pass', `GET /commands/${schema}/${version} → 200 schema document`);
      if (!sRes.contentType.includes('schema+json') && !sRes.contentType.includes('application/json')) {
        record(S, 'warn', `Schema document Content-Type "${sRes.contentType}" — application/schema+json expected`);
      }
    } else record(S, 'fail', `GET /commands/${schema}/${version} returned ${sRes.status || sRes.error}`);

    // The internal dialect stays behind the edge: vendor members of a served schema document must not
    // name internal components, and a public command must not ask its caller to mint a secret.
    const internal = new Set<string>();
    const minting: string[] = [];
    for (const e of entries.slice(0, 12)) {
      const doc = e === entries[0] ? sRes : await http('GET', `${ep}/commands/${e.schema}/${e.version}`, opts, auth);
      const d = asDict(doc.json);
      if (!d) continue;
      for (const k of Object.keys(d)) if (/^x-(source|target|queue|component|route|handler)/i.test(k)) internal.add(k);
      if (ctx.anonymous && MINTED_SECRET.test(JSON.stringify(d))) minting.push(String(e.schema));
    }
    if (internal.size) record(S, 'warn', `Served schema documents carry internal routing members (${[...internal].join(', ')}) — nothing of the internal dialect is shown to a caller`);
    if (minting.length) record(S, 'warn', `Public command(s) ask the caller to mint or keep a secret: ${minting.join(', ')} — identifiers are not secrets; every secret is generated by the service (register agents through authentication.deviceAuthorizationUrl)`);
  }

  // Route-exists probe: unknown type must be rejected by validation, not routing.
  const probe = await http('POST', `${ep}/commands`, opts, auth, {
    specversion: '1.0', id: `best-validate-${Date.now()}`, source: 'best-validate',
    type: 'BestValidateNonexistentType', datacontenttype: 'application/json',
    dataschema: `${ep}/commands/best-validate-nonexistent/1.0`,
    time: new Date().toISOString(), data: {}
  });
  if ([400, 422].includes(probe.status)) {
    record(S, 'pass', `POST /commands rejects unknown command type with ${probe.status} (non-destructive probe)`);
    const eValidate = ajv.getSchema('https://behavioralstate.io/v1/schemas/error.json');
    if (probe.json !== undefined && eValidate) {
      if (eValidate(probe.json)) record(S, 'pass', 'Error response matches the BEST error format');
      else record(S, 'warn', 'Error response body does not match {error:{code,message}}', ajvErrors(eValidate));
    }
  } else if (probe.status === 401 && !auth) {
    record(S, 'pass', 'POST /commands → 401 without credentials (route exists, auth enforced)');
  } else if ([404, 405, 501].includes(probe.status)) {
    record(S, 'fail', `POST /commands returned ${probe.status} — required route missing for an active capability`);
  } else {
    record(S, 'warn', `POST /commands unknown-type probe returned ${probe.status || probe.error} — expected 400/422`);
  }

  // CloudEvents structured content mode: the same non-destructive probe, sent as application/cloudevents+json.
  const ce = await http('POST', `${ep}/commands`, opts, auth, {
    specversion: '1.0', id: `best-validate-ce-${Date.now()}`, source: 'best-validate',
    type: 'BestValidateNonexistentType', datacontenttype: 'application/json',
    dataschema: `${ep}/commands/best-validate-nonexistent/1.0`,
    time: new Date().toISOString(), data: {}
  }, { contentType: 'application/cloudevents+json' });
  if (ce.status === 415) record(S, STAGED, `POST /commands refuses Content-Type application/cloudevents+json (415)${STAGED_NOTE}`);
  else if ([400, 422].includes(ce.status) || (ce.status === 401 && !auth)) record(S, 'pass', 'POST /commands accepts Content-Type application/cloudevents+json');

  const notFound = await http('GET', `${ep}/commands/best-validate-nonexistent/1.0`, opts, auth);
  if (notFound.status === 404) record(S, 'pass', 'Unknown schema document → 404');
  else record(S, 'warn', `Unknown schema document returned ${notFound.status || notFound.error} — expected 404`);
}

async function checkEvents(cap: Capability, ep: string, ctx: ProbeContext, opts: Options, ajv: Ajv2020): Promise<void> {
  const { auth, authDeclared } = ctx;
  const S = 'events';
  if (authDeclared) {
    const unauth = await http('GET', `${ep}/events`, opts, null);
    if (unauth.status === 401) record(S, 'pass', 'GET /events requires authentication');
    else if (unauth.status === 200) record(S, 'warn', 'GET /events returns 200 without credentials — events must be tenant-scoped/authenticated unless explicitly public');
  }
  const res = await http('GET', `${ep}/events`, opts, auth);
  if (!auth && authDeclared && res.status === 401) {
    record(S, 'pass', 'GET /events → 401 without credentials (route exists) — pass --api-key for full validation');
    return;
  }
  if (res.status !== 200 || res.json === undefined) { record(S, 'fail', `GET /events returned ${res.status || res.error}`); return; }
  const body = asDict(res.json);
  if (!body || !Array.isArray(body.events)) { record(S, 'fail', 'GET /events body has no "events" array'); return; }
  record(S, 'pass', `GET /events → 200 with events array (${(body.events as unknown[]).length} items)`);

  const first = asDict((body.events as unknown[])[0]);
  if (first && typeof first.specversion === 'string') {
    const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/cloudEvent.json#/$defs/cloudEvent');
    if (validate) {
      if (validate(first)) record(S, 'pass', 'First event validates as a BEST envelope');
      else record(S, 'warn', 'First event fails envelope validation', ajvErrors(validate));
    }
  }
}

async function checkQueries(cap: Capability, ep: string, ctx: ProbeContext, opts: Options, ajv: Ajv2020): Promise<void> {
  const { auth, authDeclared } = ctx;
  const S = 'queries';
  const res = await http('GET', `${ep}/queries`, opts, auth);
  if (!auth && authDeclared && res.status === 401) {
    record(S, 'pass', 'GET /queries → 401 without credentials (route exists) — pass --api-key for full validation');
    return;
  }
  if (res.status !== 200 || res.json === undefined) { record(S, 'fail', `GET /queries returned ${res.status || res.error} — required for a declared active queries capability`); return; }
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/agents/queries.json#/$defs/queryCatalogue');
  if (validate && !validate(res.json)) record(S, 'fail', 'Query catalogue fails schema validation', ajvErrors(validate));
  else record(S, 'pass', 'GET /queries → 200, catalogue validates');

  const entries = (asDict(res.json)?.queries ?? []) as Dict[];
  noteOperations(ctx, entries.map(e => String(e.schema ?? '')));
  checkVocabulary(S, 'query', entries.map(e => String(e.schema ?? '')));
  if (!entries.length) { record(S, 'warn', 'Query catalogue is empty — schema/execute probes skipped'); return; }

  const { schema, version } = entries[0] as { schema?: string; version?: string };
  const sRes = await http('GET', `${ep}/queries/${schema}/${version}`, opts, auth);
  if (sRes.status === 200 && asDict(sRes.json)?.response) {
    record(S, 'pass', `GET /queries/${schema}/${version} → 200 with response schema`);
  } else record(S, 'fail', `GET /queries/${schema}/${version} returned ${sRes.status || sRes.error} or lacks "response" section`);

  const xRes = await http('GET', `${ep}/queries/${schema}`, opts, auth);
  if (xRes.status === 200 && xRes.json !== undefined) {
    record(S, 'pass', `GET /queries/${schema} executes → 200`);
    const responseSchema = asDict(sRes.json)?.response;
    if (responseSchema) {
      try {
        const localAjv = new Ajv2020({ strict: false });
        addFormats.default ? addFormats.default(localAjv) : (addFormats as unknown as (a: Ajv2020) => void)(localAjv);
        const v = localAjv.compile(responseSchema as object);
        if (v(xRes.json)) record(S, 'pass', 'Query result matches its declared response schema');
        else record(S, 'warn', 'Query result does not match its declared response schema', ajvErrors(v));
      } catch { record(S, 'warn', 'Declared response schema is not itself a compilable JSON Schema'); }
    }
  } else if (xRes.status === 400) {
    record(S, 'pass', `GET /queries/${schema} → 400 (route exists; required parameters missing)`);
  } else record(S, 'fail', `GET /queries/${schema} returned ${xRes.status || xRes.error}`);
}


// ── 0.9.11: probe context, vocabulary, workflows ──────────────────────────────

/** What a capability probe needs to know about the surface it is probing. */
interface ProbeContext {
  serviceKey: string;
  auth: AuthPlan | null;
  authDeclared: boolean;   // the governing authentication block is not "none"
  isPublic: boolean;       // the service declares "type": "none" for itself
  anonymous: boolean;      // it answers without credentials, declared or not (set by checkAccess)
  operations: Map<string, Set<string>>;
}

function noteOperations(ctx: ProbeContext, names: string[]): void {
  const set = ctx.operations.get(ctx.serviceKey) ?? new Set<string>();
  names.filter(Boolean).forEach(n => set.add(n));
  ctx.operations.set(ctx.serviceKey, set);
}

// The act IS the name ("sign-in", "com.example.workflows.sign-out") — not a name that merely contains the words
// ("sign-in-for-a-recording" is about a site being recorded, not about the person and this platform).
const PERSON_WORDS = /(^|[.\/])(sign-?in|sign-?up|sign-?out|log-?in|log-?out)$/i;

/** Signing in, up and out are the person's, on the platform's pages: no BEST operation is named after them. */
function checkVocabulary(section: string, kind: string, names: string[]): void {
  const hits = names.filter(n => PERSON_WORDS.test(n));
  if (hits.length) record(section, 'warn', `${kind}(s) named after the person's acts: ${hits.join(', ')} — registering and revoking are the agent's and are named as such`);
}

const MINTED_SECRET = /\b(mint|generate|invent)\b[^.]{0,80}\b(uuid|guid|secret|code)\b|keep it secret|\bsecret\b[^.]{0,40}\bcorrelation/i;
const CLIENT_CONFIG = /mcp\.json|mcp-config|claude_desktop_config|\bnpx\b|environment variable|\benv var|your (client|mcp)('s)? config/i;

async function checkWorkflows(cap: Capability, ep: string, ctx: ProbeContext, opts: Options, ajv: Ajv2020): Promise<void> {
  const S = 'workflows';
  const { auth, authDeclared } = ctx;
  const res = await http('GET', `${ep}/workflows`, opts, auth);
  if (!auth && authDeclared && res.status === 401) {
    record(S, 'pass', 'GET /workflows → 401 without credentials (route exists) — pass --api-key for full validation');
    return;
  }
  if (res.status !== 200 || res.json === undefined) { record(S, 'fail', `GET /workflows returned ${res.status || res.error} — required for a declared active workflows capability`); return; }
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/agents/workflows.json#/$defs/workflowIndex');
  if (validate && !validate(res.json)) record(S, 'fail', 'Workflow index fails schema validation', ajvErrors(validate));
  else record(S, 'pass', 'GET /workflows → 200, index validates');

  const index = (asDict(res.json)?.workflows ?? []) as Dict[];
  checkVocabulary(S, 'workflow', index.map(w => String(w.id ?? '')));

  const unresolved: string[] = [];
  const instructing: string[] = [];
  const minting: string[] = [];
  for (const w of index.slice(0, 8)) {
    const id = String(w.id ?? '');
    const r = await http('GET', `${ep}/workflows/${encodeURIComponent(id)}`, opts, auth);
    const recipe = asDict(r.json);
    if (r.status !== 200 || !recipe) { record(S, 'fail', `GET /workflows/${id} returned ${r.status || r.error}`); continue; }
    const steps = (Array.isArray(recipe.steps) ? recipe.steps : []) as Dict[];
    for (const step of steps) {
      const ds = String(step.dataschema ?? '');
      if (!isAbsoluteUri(ds)) { unresolved.push(`${id}: "${ds}" is not an absolute URI`); continue; }
      // The blind pass: a step is reachable through its dataschema alone, or it is not reachable.
      if (new URL(ds).origin === new URL(ep).origin) {
        const d = await http('GET', ds, opts, auth);
        if (d.status !== 200 && !(d.status === 401 && !auth)) unresolved.push(`${id}: ${ds} → ${d.status || d.error}`);
      }
    }
    const prose = [recipe.description, ...steps.map(st => st.guidance)].filter(t => typeof t === 'string').join(' ');
    if (CLIENT_CONFIG.test(prose)) instructing.push(id);
    if (ctx.anonymous && MINTED_SECRET.test(prose)) minting.push(id);
  }
  if (unresolved.length) record(S, 'fail', `Workflow steps whose dataschema does not resolve in the live catalogue (${unresolved.length})`, unresolved.slice(0, 4).join('; '));
  else if (index.length) record(S, 'pass', 'Every step of the first recipes resolves through its dataschema');
  if (minting.length) record(S, 'warn', `Recipe(s) on a surface that needs no credential ask the caller to mint or keep a secret: ${minting.join(', ')} — identifiers are not secrets; every secret is generated by the service (register agents through authentication.deviceAuthorizationUrl)`);
  if (instructing.length) record(S, 'warn', `Recipe text instructs the consumer about its own client or configuration: ${instructing.join(', ')} — service text has no authority over the consumer (Manifest Discipline rule 5)`);
}

// ── 0.9.11: access declared versus access served ──────────────────────────────

const FIRST_GET: Record<string, string> = { commands: '/commands', events: '/events', queries: '/queries', workflows: '/workflows' };
const undeclaredPublic = new Set<string>();

async function checkAccess(kind: string, ep: string, ctx: ProbeContext, opts: Options): Promise<void> {
  const S = 'access';
  const path = FIRST_GET[kind];
  if (!path) return;
  const res = await http('GET', `${ep}${path}`, opts, null);
  if (res.status === 200) ctx.anonymous = true;
  if (ctx.isPublic) {
    if (res.status === 401 || res.status === 403) record(S, 'fail', `${ctx.serviceKey} declares "type": "none" but GET ${path} answers ${res.status} without credentials`);
    else if (res.status === 200) record(S, 'pass', `${ctx.serviceKey}: public surface, GET ${path} → 200 without credentials`);
  } else if (ctx.authDeclared && res.status === 200 && kind !== 'events' && !undeclaredPublic.has(ctx.serviceKey)) {
    undeclaredPublic.add(ctx.serviceKey);
    record(S, STAGED, `${ctx.serviceKey}: GET ${path} → 200 without credentials, but the governing authentication block requires one — declare the service's own authentication ("type": "none" for a public surface)${STAGED_NOTE}`);
  }
}

// ── 0.9.11: Manifest Discipline ───────────────────────────────────────────────

const URL_IN_TEXT = /https?:\/\/|\bwww\.[a-z]/i;
const CREDENTIAL_IN_TEXT = /\bAuthorization\b|\bBearer\b|\bX-[A-Z][A-Za-z]+(-[A-Za-z]+)+\b/;
const TEMPLATE_IN_TEXT = /\{[A-Za-z][A-Za-z0-9_]*\}/;

function describedThings(root: Dict): { where: string; text: string; serviceKey?: string }[] {
  const out: { where: string; text: string; serviceKey?: string }[] = [];
  for (const [k, v] of Object.entries(asDict(root.services) ?? {})) {
    const d = asDict(v)?.description;
    if (typeof d === 'string') out.push({ where: `service ${k}`, text: d, serviceKey: k });
  }
  for (const cap of capabilities(root)) {
    const d = cap.dict.description;
    if (typeof d === 'string') out.push({ where: `capability ${cap.name}${cap.service ? ` (${cap.service})` : ''}`, text: d, serviceKey: serviceKeyFor(cap, root) });
  }
  return out;
}

function checkDiscipline(root: Dict, label: string, tenantRoot: Dict | undefined, tenantFetched: boolean): void {
  const S = `discipline (${label})`;
  const services = asDict(root.services) ?? {};
  const caps = capabilities(root);
  const isRouterRoot = !!asDict(root.tenants);

  // Rule 3 — every service is reachable by structure.
  const referenced = new Set(caps.map(c => serviceKeyFor(c, root)).filter(Boolean) as string[]);
  const orphans = Object.keys(services).filter(k => !referenced.has(k));
  if (!orphans.length) record(S, 'pass', 'Every declared service is the implementing service of a capability');
  for (const k of orphans) {
    if (!isRouterRoot) { record(S, STAGED, `Service ${k} is referenced by no capability — it exists only as a description${STAGED_NOTE}`); continue; }
    if (!tenantFetched || !tenantRoot) { record(S, 'warn', `Service ${k} has no capability in this multi-tenant root — cannot confirm without --tenant that its tenant manifests declare it`); continue; }
    const tRef = new Set(capabilities(tenantRoot).map(c => serviceKeyFor(c, tenantRoot)).filter(Boolean) as string[]);
    if (tRef.has(k)) record(S, 'pass', `Service ${k}: announced by the root, declared with its capabilities by the tenant manifest`);
    else record(S, STAGED, `Service ${k} has no capability in the root and none in the tenant manifest — it exists only as a description${STAGED_NOTE}`);
  }

  // Rule 4 — no placeholders in structure.
  const templated: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      if (path !== 'tenants.manifest' && !path.endsWith('.description') && isAbsoluteUri(v) && TEMPLATE_IN_TEXT.test(v)) templated.push(`${path} = ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (asDict(v)) for (const [k, x] of Object.entries(v as Dict)) walk(x, path ? `${path}.${k}` : k);
  };
  walk(root, '');
  if (templated.length) record(S, STAGED, `URI templates outside tenants.manifest (${templated.length})${STAGED_NOTE}`, templated.slice(0, 3).join('; '));
  else record(S, 'pass', 'No URI template outside tenants.manifest');

  const pseudo: string[] = [];
  for (const [k, v] of Object.entries(services)) {
    const ep = asDict(asDict(v)?.http)?.endpoint;
    if (typeof ep !== 'string') continue;
    const last = ep.replace(/\/+$/, '').split('/').pop()?.toLowerCase() ?? '';
    const siblingBase = Object.values(services).some(o => {
      const other = asDict(asDict(o)?.http)?.endpoint;
      return typeof other === 'string' && other.replace(/\/+$/, '') === ep.replace(/\/+$/, '').slice(0, -(last.length + 1));
    });
    if (PSEUDO_TENANTS.includes(last) && (siblingBase || /\/tenants\//i.test(ep))) pseudo.push(`${k} → ${ep}`);
  }
  if (pseudo.length) record(S, STAGED, `Surface hosted under a constant pseudo-tenant: ${pseudo.join('; ')} — a tenant ID names a real scope; declare a root-level service with its own authentication${STAGED_NOTE}`);

  // Rules 1 and 2 — descriptions carry meaning, never mechanics, and stay short.
  let clean = true;
  for (const d of describedThings(root)) {
    if (d.text.length > DESCRIPTION_LIMIT) { clean = false; record(S, STAGED, `${d.where}: description is ${d.text.length} characters — the limit is ${DESCRIPTION_LIMIT}${STAGED_NOTE}`); }
    const found: string[] = [];
    if (URL_IN_TEXT.test(d.text)) found.push('a URL');
    if (TEMPLATE_IN_TEXT.test(d.text)) found.push('a URI template');
    if (CREDENTIAL_IN_TEXT.test(d.text)) found.push('a header name or credential format');
    if (found.length) { clean = false; record(S, STAGED, `${d.where}: description carries mechanics (${found.join(', ')}) — each has a structural home${STAGED_NOTE}`); }
  }
  if (clean) record(S, 'pass', `Descriptions are within ${DESCRIPTION_LIMIT} characters and carry no URLs, templates or credential formats`);
}

/** Rule 1, second half — runs once the catalogues are known: a description must not name catalogue operations. */
function checkDescriptionsAgainstCatalogues(root: Dict, label: string, operations: Map<string, Set<string>>): void {
  const S = `discipline (${label})`;
  const all = new Set<string>();
  operations.forEach(set => set.forEach(n => { if (n.includes('-')) all.add(n); }));
  if (!all.size) return;
  for (const d of describedThings(root)) {
    const hits = [...all].filter(n => new RegExp(`(^|[^a-z0-9-])${n}([^a-z0-9-]|$)`, 'i').test(d.text));
    if (hits.length) record(S, STAGED, `${d.where}: description names catalogue operations (${hits.slice(0, 6).join(', ')}) — operations are discovered from the catalogues${STAGED_NOTE}`);
  }
}

// ── 0.9.11: agent registration (RFC 8628) ─────────────────────────────────────

async function checkRegistration(root: Dict, opts: Options): Promise<void> {
  const S = 'registration';
  const blocks: { where: string; block: Dict }[] = [];
  const rootAuth = asDict(root.authentication);
  if (rootAuth) blocks.push({ where: 'root', block: rootAuth });
  for (const [k, v] of Object.entries(asDict(root.services) ?? {})) {
    const own = asDict(asDict(v)?.authentication);
    if (own) blocks.push({ where: `service ${k}`, block: own });
  }
  const needsCredential = blocks.some(b => (b.block.type ?? 'none') !== 'none');
  const declaring = blocks.filter(b => typeof b.block.deviceAuthorizationUrl === 'string');
  if (!declaring.length) {
    if (needsCredential) record(S, 'warn', 'A credential is required and no authentication.deviceAuthorizationUrl is declared — an agent cannot obtain one by itself and has to ask the person for a key');
    return;
  }
  for (const { where, block } of declaring) {
    const deviceUrl = String(block.deviceAuthorizationUrl);
    const tokenUrl = typeof block.tokenUrl === 'string' ? block.tokenUrl : '';
    if (!tokenUrl) { record(S, 'fail', `${where}: deviceAuthorizationUrl is declared without tokenUrl`); continue; }
    record(S, 'pass', `${where}: deviceAuthorizationUrl and tokenUrl declared`);

    // Read-only: an unknown device code must be refused as a bad grant, which proves the grant type is served.
    const bogus = await http('POST', tokenUrl, opts, null, undefined, {
      form: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: `best-validate-unknown-${Date.now()}`, client_id: 'best-validate' }
    });
    const err = String(asDict(bogus.json)?.error ?? '');
    if (err === 'unsupported_grant_type' || [404, 405, 501].includes(bogus.status)) record(S, 'fail', `${where}: tokenUrl does not serve the device-code grant (${bogus.status} ${err})`);
    else if (['invalid_grant', 'expired_token'].includes(err)) record(S, 'pass', `${where}: tokenUrl refuses an unknown device_code with ${err}`);
    else record(S, 'warn', `${where}: tokenUrl answered an unknown device_code with ${bogus.status} ${err || bogus.error || ''} — RFC 8628 expects invalid_grant or expired_token`);

    if (!opts.probeRegistration) { record(S, 'skip', `${where}: device authorization request not sent — pass --probe-registration (it opens a real, inert registration that expires by itself)`); continue; }
    const res = await http('POST', deviceUrl, opts, null, undefined, { form: { client_id: 'best-validate', agent_label: 'best-validate conformance probe' } });
    const a = asDict(res.json);
    if (res.status !== 200 || !a) { record(S, 'fail', `${where}: POST deviceAuthorizationUrl returned ${res.status || res.error}`); continue; }
    const missing = ['device_code', 'user_code', 'verification_uri', 'expires_in'].filter(m => a[m] === undefined);
    if (missing.length) { record(S, 'fail', `${where}: device authorization response lacks ${missing.join(', ')} (RFC 8628 §3.2)`); continue; }
    record(S, 'pass', `${where}: device authorization response carries the RFC 8628 members`);
    const code = String(a.device_code);
    if (code === String(a.user_code)) record(S, 'fail', `${where}: device_code equals user_code — the code shown to the person must not redeem the credential`);
    else if (code.length < 20) record(S, 'fail', `${where}: device_code is ${code.length} characters — it must be unguessable`);
    else record(S, 'pass', `${where}: device_code is service-generated, distinct from user_code (${code.length} characters)`);
    if (typeof a.verification_uri === 'string' && !a.verification_uri.startsWith('https://')) record(S, 'warn', `${where}: verification_uri is not https`);
    const complete = typeof a.verification_uri_complete === 'string' ? a.verification_uri_complete : '';
    if (complete.includes(code)) record(S, 'fail', `${where}: verification_uri_complete contains the device_code — the person's link must carry the user_code only`);
  }
}

// ── 0.9.11: the manifest is the only entry ────────────────────────────────────

async function checkSingleEntry(base: string, opts: Options, operations: Map<string, Set<string>>): Promise<void> {
  const S = 'single entry';
  const origin = new URL(base).origin;
  const res = await http('GET', `${origin}/llms.txt`, opts, null, undefined, { accept: 'text/plain, */*' });
  const looksLikeText = res.status === 200 && !/<html|<!doctype/i.test(res.text.slice(0, 400));
  if (!looksLikeText) { record(S, 'pass', 'No /llms.txt on the origin'); return; }
  const names: string[] = [];
  operations.forEach(set => set.forEach(n => { if (n.includes('-') && res.text.includes(n)) names.push(n); }));
  if (/\/commands\b|\/queries\b|\/workflows\b/.test(res.text) || names.length) {
    record(S, STAGED, `/llms.txt restates the BEST surface (${names.slice(0, 5).join(', ') || 'endpoint paths'}) — the manifest is the only entry; a copy drifts${STAGED_NOTE}`);
  } else record(S, 'pass', '/llms.txt is present and only points — it restates no operations');
}

// ── Output ────────────────────────────────────────────────────────────────────

function report(opts: Options): number {
  const failures = checks.filter(c => c.level === 'fail').length;
  const warnings = checks.filter(c => c.level === 'warn').length;
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      endpoint: opts.url, mode: MODE_LABEL, verdict: failures ? 'fail' : 'pass',
      failures, warnings, checks
    }, null, 2) + '\n');
    return failures ? 1 : 0;
  }
  const icon: Record<Level, string> = { pass: ' OK ', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };
  const sections = [...new Set(checks.map(c => c.section))];
  for (const section of sections) {
    process.stdout.write(`\n[${section}]\n`);
    for (const c of checks.filter(x => x.section === section)) {
      process.stdout.write(`  ${icon[c.level]}  ${c.message}\n`);
      if (c.detail) process.stdout.write(`        ${c.detail}\n`);
    }
  }
  process.stdout.write(`\n${failures ? 'NOT CONFORMANT' : 'CONFORMANT'} — ${failures} failure(s), ${warnings} warning(s). Mode: ${MODE_LABEL}\n`);
  return failures ? 1 : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function probeCapabilities(root: Dict, label: string, opts: Options, ajv: Ajv2020, operations: Map<string, Set<string>>): Promise<void> {
  for (const cap of capabilities(root)) {
    if (cap.status !== 'active') {
      record('capabilities', 'skip', `${cap.name}: status "${cap.status}" — endpoint requirements do not apply`);
      continue;
    }
    if (!cap.name.startsWith(NS + 'agents.')) continue; // custom capabilities: out of checklist scope
    const ep = endpointFor(cap, root);
    const serviceKey = serviceKeyFor(cap, root);
    if (!ep || !serviceKey) { record('capabilities', 'fail', `${cap.name}: cannot resolve an http endpoint (missing service/http.endpoint)`); continue; }
    const governing = governingAuth(serviceKey, root);
    const authDeclared = (governing?.type ?? 'none') !== 'none';
    // --api-key is the credential of the manifest's own authentication block. A service that declares a different
    // scheme for itself (a share token, say) is opened by a credential this run does not hold: probe it without one.
    const ctx: ProbeContext = {
      serviceKey, authDeclared, operations,
      auth: hasOwnAuth(serviceKey, root) ? null : buildAuthPlan(opts, governing),
      isPublic: hasOwnAuth(serviceKey, root) && !authDeclared,
      anonymous: false
    };
    const kind = cap.name.slice((NS + 'agents.').length);
    await checkAccess(kind, ep, ctx, opts);
    if (kind === 'commands') await checkCommands(cap, ep, ctx, opts, ajv);
    else if (kind === 'events') await checkEvents(cap, ep, ctx, opts, ajv);
    else if (kind === 'queries') await checkQueries(cap, ep, ctx, opts, ajv);
    else if (kind === 'workflows') await checkWorkflows(cap, ep, ctx, opts, ajv);
  }
  checkDescriptionsAgainstCatalogues(root, label, operations);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const base = opts.url.replace(/\/+$/, '');
  const ajv = loadAjv();

  const root = await checkDiscovery(base, opts, ajv);
  if (!root) { process.exitCode = report(opts); return; }

  const { workingRoot, probeable } = await checkTenancy(root, base, opts, ajv);
  const tenantRoot = workingRoot !== root ? workingRoot : undefined;
  const operations = new Map<string, Set<string>>();

  checkDiscipline(root, 'root', tenantRoot, !!tenantRoot);
  if (tenantRoot) checkDiscipline(tenantRoot, 'tenant', undefined, false);
  await checkRegistration(root, opts);

  // The root's own capabilities are probed whether or not a tenant was given: a multi-tenant host may
  // serve root-level surfaces (a public one above all) beside its tenant manifests.
  await probeCapabilities(root, 'root', opts, ajv, operations);
  if (tenantRoot && probeable) await probeCapabilities(tenantRoot, 'tenant', opts, ajv, operations);

  await checkSingleEntry(base, opts, operations);

  process.exitCode = report(opts);
}

main().catch(e => { process.stderr.write(`best-validate internal error: ${e?.stack ?? e}\n`); process.exitCode = 2; });
