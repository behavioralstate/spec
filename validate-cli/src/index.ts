#!/usr/bin/env node
/**
 * best-validate — conformance validator for BEST (Behavioral State Protocol) endpoints.
 *
 * Runs the conformance checklist from the spec against a live endpoint:
 * discovery manifest (fetch + JSON Schema validation), capability declaration
 * rules, per-capability endpoint probes, multi-tenant root-manifest rules,
 * error format, and auth enforcement.
 *
 * All probes are non-destructive: the only POST issued is a command with an
 * intentionally unknown type, which a conformant endpoint rejects before queuing.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

// ── CLI arguments ─────────────────────────────────────────────────────────────

interface Options {
  url: string;
  legacyBsp: boolean;
  apiKey?: string;
  authType?: string;    // bearer | apikey | none (overrides manifest declaration)
  authHeader: string;
  authIn: string;       // header | query
  authParam: string;
  tenant?: string;
  json: boolean;
  timeoutMs: number;
}

function usage(): never {
  process.stdout.write(`Usage: best-validate <endpoint-url> [options]

Validates a live endpoint against the BEST conformance checklist.

Options:
  --legacy-bsp          Validate a pre-0.9.0 endpoint: /.well-known/bsp, root key
                        "bsp", io.bsp.* capability names, relative dataschema
                        tolerated (reported as warnings).
  --api-key <key>       Credential for authenticated endpoints.
  --auth-type <t>       bearer | apikey | none. Default: what the manifest declares.
  --auth-header <name>  Header name for apikey auth (default: X-Api-Key).
  --auth-in <where>     header | query (default: header).
  --auth-param <name>   Query parameter name when --auth-in query (default: apikey).
  --tenant <id>         Tenant ID for multi-tenant hosts — expands tenants.manifest
                        and validates the tenant manifest and its capabilities.
  --json                Machine-readable output.
  --timeout <ms>        Per-request timeout (default: 10000).
  -h, --help            This text.

Exit code: 0 when no checks fail (warnings allowed), 1 otherwise.
`);
  process.exit(0);
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    url: '', legacyBsp: false, authHeader: 'X-Api-Key', authIn: 'header',
    authParam: 'apikey', json: false, timeoutMs: 10000
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
      case '--legacy-bsp': opts.legacyBsp = true; break;
      case '--json': opts.json = true; break;
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

// ── Naming (BEST vs legacy BSP) ───────────────────────────────────────────────

interface Names { wellKnown: string; rootKey: string; ns: string; label: string; }
const MODERN: Names = { wellKnown: '/.well-known/best', rootKey: 'best', ns: 'io.best.', label: 'BEST 0.9.x' };
const LEGACY: Names = { wellKnown: '/.well-known/bsp',  rootKey: 'bsp',  ns: 'io.bsp.',  label: 'BSP 0.8.x (--legacy-bsp)' };

// ── Check collection ──────────────────────────────────────────────────────────

type Level = 'pass' | 'warn' | 'fail' | 'skip';
interface Check { section: string; level: Level; message: string; detail?: string; }
const checks: Check[] = [];
function record(section: string, level: Level, message: string, detail?: string): void {
  checks.push({ section, level, message, detail });
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

interface Resp { status: number; contentType: string; text: string; json?: unknown; error?: string; }

async function http(method: string, url: string, opts: Options, auth: AuthPlan | null, body?: unknown): Promise<Resp> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let finalUrl = url;
  if (auth) {
    if (auth.type === 'bearer') headers['Authorization'] = `Bearer ${auth.key}`;
    else if (auth.type === 'apikey' && auth.in === 'header') headers[auth.header] = auth.key;
    else if (auth.type === 'apikey' && auth.in === 'query') {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${encodeURIComponent(auth.param)}=${encodeURIComponent(auth.key)}`;
    }
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(finalUrl, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
  for (const rel of ['cloudEvent.json', 'discovery.json', 'error.json', 'agents/commands.json', 'agents/events.json', 'agents/queries.json']) {
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, rel), 'utf-8'));
    ajv.addSchema(schema);
  }
  return ajv;
}

function ajvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? []).slice(0, 5)
    .map(e => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');
}

/** Legacy manifests use root key "bsp" and io.bsp.* names; normalize so the 0.9.0 schema applies. */
function normalizeLegacy(manifest: unknown): unknown {
  return JSON.parse(JSON.stringify(manifest).replaceAll('"bsp"', '"best"').replaceAll('io.bsp.', 'io.best.'));
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Dict : undefined;

function manifestRoot(manifest: unknown, names: Names): Dict | undefined {
  return asDict(asDict(manifest)?.[names.rootKey]);
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

/** Resolve the http endpoint base URL a capability's paths append to. */
function endpointFor(cap: Capability, root: Dict): string | undefined {
  const services = asDict(root.services) ?? {};
  const key = cap.service
    ?? Object.keys(services).find(k => cap.name.startsWith(k + '.'))
    ?? (Object.keys(services).length === 1 ? Object.keys(services)[0] : undefined);
  if (!key) return undefined;
  const httpBlock = asDict(asDict(services[key])?.http);
  const ep = httpBlock?.endpoint;
  return typeof ep === 'string' ? ep.replace(/\/+$/, '') : undefined;
}

const isAbsoluteUri = (s: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(s);

// ── Probe sections ────────────────────────────────────────────────────────────

async function checkDiscovery(base: string, names: Names, opts: Options, ajv: Ajv2020): Promise<Dict | undefined> {
  const S = 'discovery';
  const url = base + names.wellKnown;
  const res = await http('GET', url, opts, null);
  if (res.error || res.status === 0) { record(S, 'fail', `GET ${names.wellKnown} unreachable`, res.error); return undefined; }
  if (res.status !== 200) { record(S, 'fail', `GET ${names.wellKnown} returned ${res.status} — must be 200 without credentials`); return undefined; }
  record(S, 'pass', `GET ${names.wellKnown} → 200 without credentials`);

  if (!res.contentType.includes('application/json')) {
    record(S, 'warn', `Content-Type is "${res.contentType}" — must be application/json`);
  } else record(S, 'pass', 'Content-Type: application/json');

  if (res.json === undefined) { record(S, 'fail', 'Response body is not valid JSON'); return undefined; }

  const root = manifestRoot(res.json, names);
  if (!root) { record(S, 'fail', `Manifest root key "${names.rootKey}" missing`); return undefined; }
  record(S, 'pass', `Manifest root key "${names.rootKey}" present`);

  const toValidate = opts.legacyBsp ? normalizeLegacy(res.json) : res.json;
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/discovery.json');
  if (validate) {
    if (validate(toValidate)) record(S, 'pass', 'Manifest validates against discovery.json' + (opts.legacyBsp ? ' (legacy names normalized)' : ''));
    else record(S, 'fail', 'Manifest fails discovery.json validation', ajvErrors(validate));
  }

  if (typeof root.version === 'string' && /^\d+\.\d+\.\d+$/.test(root.version)) {
    record(S, 'pass', `Protocol version ${root.version}`);
  } else record(S, 'fail', 'Root "version" missing or not MAJOR.MINOR.PATCH');

  for (const cap of capabilities(root)) {
    if (cap.name.startsWith(names.ns)) {
      const missing = ['spec', 'schema'].filter(f => typeof cap.dict[f] !== 'string');
      if (missing.length) record(S, 'fail', `${cap.name}: missing required ${missing.join(', ')} URL(s) for ${names.ns}* capabilities`);
    }
    if (!['active', 'partial', 'planned'].includes(cap.status)) {
      record(S, 'fail', `${cap.name}: invalid status "${cap.status}"`);
    }
  }
  return root;
}

async function checkTenancy(root: Dict, base: string, names: Names, opts: Options, ajv: Ajv2020): Promise<{ workingRoot: Dict; probeable: boolean }> {
  const S = 'multi-tenancy';
  const tenants = asDict(root.tenants);
  if (!tenants) { return { workingRoot: root, probeable: true }; }

  const template = typeof tenants.manifest === 'string' ? tenants.manifest : '';
  if (!template.includes('{tenantId}')) {
    record(S, 'fail', 'tenants.manifest present but has no {tenantId} variable');
    return { workingRoot: root, probeable: false };
  }
  record(S, 'pass', 'tenants.manifest URI template declared');

  const tenantScoped = capabilities(root).filter(c =>
    [`${names.ns}agents.commands`, `${names.ns}agents.events`, `${names.ns}agents.queries`].includes(c.name));
  if (tenantScoped.length) {
    record(S, 'fail', `Root manifest of a multi-tenant host declares tenant-scoped capabilities: ${tenantScoped.map(c => c.name).join(', ')}`);
  } else record(S, 'pass', 'Root manifest declares no tenant-scoped capabilities');

  if (!opts.tenant) {
    record(S, 'skip', 'No --tenant given — tenant manifest and capability probes skipped');
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

  const tRoot = manifestRoot(res.json, names);
  if (!tRoot) { record(S, 'fail', `Tenant manifest missing root key "${names.rootKey}"`); return { workingRoot: root, probeable: false }; }
  if (asDict(tRoot.tenants)) record(S, 'fail', 'Tenant manifest must not contain a tenants block');
  else record(S, 'pass', 'Tenant manifest has no tenants block');

  const toValidate = opts.legacyBsp ? normalizeLegacy(res.json) : res.json;
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/discovery.json');
  if (validate) {
    if (validate(toValidate)) record(S, 'pass', 'Tenant manifest validates against discovery.json');
    else record(S, 'fail', 'Tenant manifest fails discovery.json validation', ajvErrors(validate));
  }
  return { workingRoot: tRoot, probeable: true };
}

async function checkCommands(cap: Capability, ep: string, auth: AuthPlan | null, authDeclared: boolean, names: Names, opts: Options, ajv: Ajv2020): Promise<void> {
  const S = 'commands';
  const res = await http('GET', `${ep}/commands`, opts, auth);
  if (!auth && authDeclared && res.status === 401) {
    record(S, 'pass', 'GET /commands → 401 without credentials (route exists, auth enforced) — pass --api-key for full validation');
    return;
  }
  if (res.status !== 200 || res.json === undefined) { record(S, 'fail', `GET /commands returned ${res.status || res.error}`); return; }
  const entries = (asDict(res.json)?.commands ?? []) as Dict[];
  // Legacy endpoints may serve relative dataschema URIs; absolutize before schema
  // validation so the uri-format rule doesn't double-report what the per-entry
  // check below already flags as a warning.
  const catalogueToValidate = opts.legacyBsp
    ? { commands: entries.map(e => ({ ...e, dataschema: isAbsoluteUri(String(e.dataschema ?? '')) ? e.dataschema : `${ep}/commands/${e.schema}/${e.version}` })) }
    : res.json;
  const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/agents/commands.json#/$defs/commandCatalogue');
  if (validate && !validate(catalogueToValidate)) record(S, 'fail', 'Command catalogue fails schema validation', ajvErrors(validate));
  else record(S, 'pass', 'GET /commands → 200, catalogue validates' + (opts.legacyBsp ? ' (relative dataschema absolutized in legacy mode)' : ''));
  for (const e of entries.slice(0, 20)) {
    const ds = String(e.dataschema ?? '');
    if (!isAbsoluteUri(ds)) {
      record(S, opts.legacyBsp ? 'warn' : 'fail',
        `Catalogue entry "${e.schema}": dataschema "${ds}" is not an absolute URI${opts.legacyBsp ? ' (tolerated in legacy mode)' : ''}`);
    }
  }
  if (entries.length && isAbsoluteUri(String(entries[0].dataschema ?? ''))) {
    record(S, 'pass', `Catalogue dataschema URIs are absolute (${entries.length} entries)`);
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

  const notFound = await http('GET', `${ep}/commands/best-validate-nonexistent/1.0`, opts, auth);
  if (notFound.status === 404) record(S, 'pass', 'Unknown schema document → 404');
  else record(S, 'warn', `Unknown schema document returned ${notFound.status || notFound.error} — expected 404`);
}

async function checkEvents(cap: Capability, ep: string, auth: AuthPlan | null, authDeclared: boolean, opts: Options, ajv: Ajv2020): Promise<void> {
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
    const candidate = { ...first };
    if (opts.legacyBsp) delete candidate.dataschema; // relative URIs tolerated in legacy mode
    const validate = ajv.getSchema('https://behavioralstate.io/v1/schemas/cloudEvent.json#/$defs/cloudEvent');
    if (validate) {
      if (validate(candidate)) record(S, 'pass', 'First event validates as a BEST envelope');
      else record(S, 'warn', 'First event fails envelope validation', ajvErrors(validate));
    }
  }
}

async function checkQueries(cap: Capability, ep: string, auth: AuthPlan | null, authDeclared: boolean, opts: Options, ajv: Ajv2020): Promise<void> {
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

// ── Output ────────────────────────────────────────────────────────────────────

function report(opts: Options, names: Names): number {
  const failures = checks.filter(c => c.level === 'fail').length;
  const warnings = checks.filter(c => c.level === 'warn').length;
  if (opts.json) {
    process.stdout.write(JSON.stringify({
      endpoint: opts.url, mode: names.label, verdict: failures ? 'fail' : 'pass',
      failures, warnings, checks
    }, null, 2) + '\n');
    return failures ? 1 : 0;
  }
  const icon: Record<Level, string> = { pass: ' OK ', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };
  let section = '';
  for (const c of checks) {
    if (c.section !== section) { section = c.section; process.stdout.write(`\n[${section}]\n`); }
    process.stdout.write(`  ${icon[c.level]}  ${c.message}\n`);
    if (c.detail) process.stdout.write(`        ${c.detail}\n`);
  }
  process.stdout.write(`\n${failures ? 'NOT CONFORMANT' : 'CONFORMANT'} — ${failures} failure(s), ${warnings} warning(s). Mode: ${names.label}\n`);
  return failures ? 1 : 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const names = opts.legacyBsp ? LEGACY : MODERN;
  const base = opts.url.replace(/\/+$/, '');
  const ajv = loadAjv();

  const root = await checkDiscovery(base, names, opts, ajv);
  if (!root) { process.exitCode = report(opts, names); return; }

  const { workingRoot, probeable } = await checkTenancy(root, base, names, opts, ajv);
  if (!probeable) { process.exitCode = report(opts, names); return; }

  const authDeclared = (asDict(workingRoot.authentication)?.type ?? 'none') !== 'none';
  const auth = buildAuthPlan(opts, asDict(workingRoot.authentication));

  for (const cap of capabilities(workingRoot)) {
    if (cap.status !== 'active') {
      record('capabilities', 'skip', `${cap.name}: status "${cap.status}" — endpoint requirements do not apply`);
      continue;
    }
    if (!cap.name.startsWith(names.ns + 'agents.')) continue; // custom capabilities: out of checklist scope
    const ep = endpointFor(cap, workingRoot);
    if (!ep) { record('capabilities', 'fail', `${cap.name}: cannot resolve an http endpoint (missing service/http.endpoint)`); continue; }
    const kind = cap.name.slice((names.ns + 'agents.').length);
    if (kind === 'commands') await checkCommands(cap, ep, auth, authDeclared, names, opts, ajv);
    else if (kind === 'events') await checkEvents(cap, ep, auth, authDeclared, opts, ajv);
    else if (kind === 'queries') await checkQueries(cap, ep, auth, authDeclared, opts, ajv);
  }

  process.exitCode = report(opts, names);
}

main().catch(e => { process.stderr.write(`best-validate internal error: ${e?.stack ?? e}\n`); process.exitCode = 2; });
