#!/usr/bin/env node
// Offline validation of docs/postman/*: no network, no running services.
//
//  1. Collection/environment JSON structure (Postman v2.1).
//  2. Every request has a test script containing at least one pm.test(...).
//  3. Every pre-request/test script (collection- and request-level) compiles.
//  4. Every {{variable}} used in a request is defined (environment, collection variables, or Postman dynamic $var).
//  5. Route coverage: every Fastify route parsed from the source (services/*/src/api/routes/*.ts with the
//     prefixes from services/*/src/app.ts, plus shared health/metrics routes and /docs) has >= 1 request.
//  6. GraphQL coverage: every Query and Mutation field in graphql/src/schema/typedefs.ts is invoked by >= 1 request.
//
// Usage (from zuma/): node scripts/check-postman-coverage.mjs [--collection <path>] [--environment <path>]
// Exit code 0 = everything covered and valid; 1 = at least one problem (listed on stderr).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
};
const collectionPath = arg('--collection', join(root, 'docs/postman/zuma.postman_collection.json'));
const environmentPath = arg('--environment', join(root, 'docs/postman/zuma-local.postman_environment.json'));

const problems = [];
const fail = (msg) => problems.push(msg);
const read = (p) => readFileSync(p, 'utf8');

// ---------------------------------------------------------------------------------------------
// Source: deployables, their base-URL variable, and their routes
// ---------------------------------------------------------------------------------------------
const DEPLOYABLES = [
  { name: 'wallet-service', dir: 'services/wallet-service', baseVar: 'walletUrl' },
  { name: 'transaction-service', dir: 'services/transaction-service', baseVar: 'transactionUrl' },
  { name: 'graphql-gateway', dir: 'graphql', baseVar: 'gatewayUrl' },
];

const ROUTE_RE = /\bapp\.(get|post|patch|put|delete)\b[\s\S]{0,400}?\(\s*['"`](\/[^'"`]*)['"`]/g;
const routesIn = (source) => [...source.matchAll(ROUTE_RE)].map((m) => ({ method: m[1].toUpperCase(), path: m[2] }));
const joinPath = (prefix, path) => `${prefix.replace(/\/$/, '')}${path}`.replace(/\/{2,}/g, '/') || '/';

const sourceRoutes = [];
const addRoute = (service, method, path, origin) => sourceRoutes.push({ service, method, path, origin });

// Shared plugin routes registered by every deployable.
const sharedRouteFiles = ['shared/http/src/health.ts', 'shared/observability/src/fastify-observability-plugin.ts'];
const sharedRoutes = sharedRouteFiles.flatMap((f) => routesIn(read(join(root, f))).map((r) => ({ ...r, origin: f })));
if (sharedRoutes.length < 3) fail(`expected >= 3 shared routes (healthz/readyz/metrics), parsed ${sharedRoutes.length}`);

for (const d of DEPLOYABLES) {
  for (const r of sharedRoutes) addRoute(d.name, r.method, r.path, r.origin);

  const appPath = join(root, d.dir, 'src/app.ts');
  const appSrc = read(appPath);

  // Route plugins: `app.register(walletRoutes, { prefix: '/api/v1', ...` → walletRoutes → '/api/v1'
  const prefixes = new Map(
    [...appSrc.matchAll(/register\(\s*(\w+)\s*,\s*\{\s*prefix:\s*['"`]([^'"`]*)['"`]/g)].map((m) => [m[1], m[2]]),
  );
  const routesDir = join(root, d.dir, 'src/api/routes');
  if (existsSync(routesDir)) {
    for (const file of readdirSync(routesDir).filter((f) => f.endsWith('.routes.ts'))) {
      const src = read(join(routesDir, file));
      const exported = src.match(/export const (\w+)\s*:\s*FastifyPluginAsync/);
      if (!exported) {
        fail(`${d.dir}/src/api/routes/${file}: no exported FastifyPluginAsync found`);
        continue;
      }
      if (!prefixes.has(exported[1])) {
        fail(`${d.dir}/src/app.ts: route plugin ${exported[1]} is not registered with a prefix`);
        continue;
      }
      const found = routesIn(src);
      if (found.length === 0) fail(`${d.dir}/src/api/routes/${file}: no routes parsed`);
      for (const r of found) addRoute(d.name, r.method, joinPath(prefixes.get(exported[1]), r.path), `${d.dir}/src/api/routes/${file}`);
    }
  }

  // Swagger UI (`routePrefix: '/docs'`) for the REST services.
  const swaggerPath = join(root, d.dir, 'src/api/plugins/swagger.ts');
  if (existsSync(swaggerPath)) {
    const m = read(swaggerPath).match(/routePrefix:\s*['"`]([^'"`]+)['"`]/);
    if (m) {
      addRoute(d.name, 'GET', m[1], swaggerPath.replace(`${root}/`, ''));
      addRoute(d.name, 'GET', `${m[1]}/json`, swaggerPath.replace(`${root}/`, ''));
    }
  }

  // GraphQL endpoint (mercurius `path: '/graphql'`) and GraphiQL.
  const gqlPath = appSrc.match(/mercurius[\s\S]*?path:\s*['"`]([^'"`]+)['"`]/);
  if (gqlPath) {
    addRoute(d.name, 'POST', gqlPath[1], `${d.dir}/src/app.ts`);
    if (/graphiql:/.test(appSrc)) addRoute(d.name, 'GET', '/graphiql', `${d.dir}/src/app.ts`);
  }
}

// GraphQL root fields from the SDL.
const typedefs = read(join(root, 'graphql/src/schema/typedefs.ts'));
const rootFields = (typeName) => {
  const block = typedefs.match(new RegExp(`type\\s+${typeName}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  if (!block) {
    fail(`typedefs.ts: type ${typeName} not found`);
    return [];
  }
  let body = block[1].replace(/"""[\s\S]*?"""/g, '').replace(/"[^"\n]*"/g, '');
  // Drop argument lists (possibly multi-line) so `walletId: String` inside them isn't counted.
  while (/\([^()]*\)/.test(body)) body = body.replace(/\([^()]*\)/g, '');
  return [...body.matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);
};
const gqlFields = [
  ...rootFields('Query').map((f) => ({ op: 'query', field: f })),
  ...rootFields('Mutation').map((f) => ({ op: 'mutation', field: f })),
];

// ---------------------------------------------------------------------------------------------
// Collection + environment
// ---------------------------------------------------------------------------------------------
let collection;
let environment;
try {
  collection = JSON.parse(read(collectionPath));
} catch (e) {
  console.error(`cannot parse ${collectionPath}: ${e.message}`);
  process.exit(1);
}
try {
  environment = JSON.parse(read(environmentPath));
} catch (e) {
  console.error(`cannot parse ${environmentPath}: ${e.message}`);
  process.exit(1);
}

if (!/collection\/v2\.1\.0/.test(collection?.info?.schema ?? '')) fail('collection info.schema is not Postman v2.1.0');
if (!Array.isArray(collection.item) || collection.item.length === 0) fail('collection has no items');
if (!Array.isArray(environment.values)) fail('environment has no values[]');

const SECRET_KEYS = ['jwtSecret', 'internalJwtSecret', 'metricsToken'];
for (const key of SECRET_KEYS) {
  const entry = environment.values?.find((v) => v.key === key);
  if (!entry) fail(`environment: missing ${key}`);
  else if (entry.value !== '') fail(`environment: ${key} must ship EMPTY (secrets are injected at run time)`);
}

const envKeys = new Set((environment.values ?? []).map((v) => v.key));
const collectionVarKeys = new Set((collection.variable ?? []).map((v) => v.key));
const definedVars = new Set([...envKeys, ...collectionVarKeys]);

const compile = (where, exec) => {
  const code = Array.isArray(exec) ? exec.join('\n') : String(exec ?? '');
  try {
    new vm.Script(code, { filename: where });
  } catch (e) {
    fail(`${where}: script does not compile: ${e.message}`);
  }
  return code;
};

for (const ev of collection.event ?? []) compile(`collection ${ev.listen}`, ev.script?.exec);

// Walk items, carrying the folder path.
const requests = [];
const walk = (items, path) => {
  for (const it of items) {
    if (Array.isArray(it.item)) walk(it.item, [...path, it.name]);
    else requests.push({ ...it, folder: path[0] ?? '(root)', fullName: [...path, it.name].join(' / ') });
  }
};
walk(collection.item ?? [], []);

const names = new Set();
const VAR_RE = /\{\{([^{}]+)\}\}/g;

for (const r of requests) {
  if (!r.request?.method || !r.request?.url) fail(`${r.fullName}: missing request.method or request.url`);
  if (names.has(r.fullName)) fail(`${r.fullName}: duplicate request name`);
  names.add(r.fullName);

  const tests = (r.event ?? []).filter((e) => e.listen === 'test');
  const testCode = tests.map((e) => compile(`${r.fullName} [test]`, e.script?.exec)).join('\n');
  r.testCount = (testCode.match(/pm\.test(?:\.skip)?\(/g) ?? []).length;
  if (!/pm\.test\(/.test(testCode)) fail(`${r.fullName}: no pm.test assertions`);
  for (const e of (r.event ?? []).filter((x) => x.listen === 'prerequest')) compile(`${r.fullName} [prerequest]`, e.script?.exec);

  // Variables set by any script count as defined.
  for (const e of r.event ?? []) {
    for (const m of (e.script?.exec ?? []).join('\n').matchAll(/collectionVariables\.set\(\s*['"]([^'"]+)['"]/g)) definedVars.add(m[1]);
  }
}
for (const ev of collection.event ?? []) {
  for (const m of (ev.script?.exec ?? []).join('\n').matchAll(/(?:cv|collectionVariables)\.set\(\s*['"]([^'"]+)['"]/g)) definedVars.add(m[1]);
}

// Undefined variable references (checked after all set() calls are known).
for (const r of requests) {
  const blob = JSON.stringify({ url: r.request?.url, header: r.request?.header, body: r.request?.body, auth: r.request?.auth });
  for (const m of blob.matchAll(VAR_RE)) {
    const name = m[1].trim();
    if (name.startsWith('$')) continue;
    if (!definedVars.has(name)) fail(`${r.fullName}: undefined variable {{${name}}}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Match requests to routes
// ---------------------------------------------------------------------------------------------
const rawUrl = (u) => (typeof u === 'string' ? u : u?.raw ?? '');
const baseVarToService = new Map(DEPLOYABLES.map((d) => [d.baseVar, d.name]));

const requestTargets = requests.map((r) => {
  const raw = rawUrl(r.request?.url);
  const m = raw.match(/^\{\{(\w+)\}\}(\/[^?#]*)?/);
  return {
    r,
    service: m ? baseVarToService.get(m[1]) : undefined,
    method: r.request?.method,
    segments: (m?.[2] ?? '/').split('/').filter(Boolean),
  };
});
for (const t of requestTargets) {
  if (!t.service) fail(`${t.r.fullName}: URL does not start with a known base variable (${[...baseVarToService.keys()].join(', ')})`);
}

const segmentMatches = (routeSeg, reqSeg) => (routeSeg.startsWith(':') ? reqSeg.length > 0 : routeSeg === reqSeg);
const covers = (route, t) => {
  if (t.service !== route.service || t.method !== route.method) return false;
  const rs = route.path.split('/').filter(Boolean);
  return rs.length === t.segments.length && rs.every((s, i) => segmentMatches(s, t.segments[i]));
};

const routeResults = sourceRoutes.map((route) => ({
  route,
  hits: requestTargets.filter((t) => covers(route, t)).length,
}));

// GraphQL operations: top-level fields of each operation in POST /graphql bodies.
const graphqlDocOf = (r) => {
  const b = r.request?.body;
  if (!b) return '';
  if (b.mode === 'graphql') return b.graphql?.query ?? '';
  if (b.mode === 'raw') {
    try {
      return JSON.parse(b.raw).query ?? '';
    } catch {
      return '';
    }
  }
  return '';
};

// Minimal GraphQL scanner: for each operation definition, collect the selection names at depth 1
// (aliases resolved, arguments and nested selections skipped, string literals ignored).
const topLevelFields = (doc) => {
  const found = [];
  const src = doc.replace(/#[^\n]*/g, '');
  let i = 0;
  while (i < src.length) {
    const head = src.slice(i).match(/^\s*(query|mutation|subscription|fragment)?\b[^{]*\{/);
    if (!head) break;
    const op = head[1] ?? 'query';
    i += head[0].length;
    let depth = 1;
    let parens = 0;
    let pendingAlias = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '"') {
        const end = src.slice(i).match(/^"(?:[^"\\]|\\.)*"/);
        i += end ? end[0].length : 1;
        continue;
      }
      if (ch === '(') parens += 1;
      else if (ch === ')') parens -= 1;
      else if (parens === 0 && ch === '{') depth += 1;
      else if (parens === 0 && ch === '}') depth -= 1;
      else if (parens === 0 && depth === 1 && /[A-Za-z_]/.test(ch)) {
        const word = src.slice(i).match(/^[A-Za-z_]\w*/)[0];
        i += word.length;
        const rest = src.slice(i).match(/^\s*:/);
        if (rest) {
          pendingAlias = true; // `alias: field` — the next word is the field
          i += rest[0].length;
          continue;
        }
        if (op !== 'fragment' && word !== 'on') found.push({ op, field: word, aliased: pendingAlias });
        pendingAlias = false;
        continue;
      }
      i += 1;
    }
  }
  return found;
};

const gqlInvocations = [];
for (const t of requestTargets) {
  if (t.service !== 'graphql-gateway' || t.method !== 'POST') continue;
  const doc = graphqlDocOf(t.r);
  if (!doc) continue;
  for (const f of topLevelFields(doc)) gqlInvocations.push({ ...f, request: t.r.fullName });
}
const gqlResults = gqlFields.map((f) => ({
  ...f,
  hits: gqlInvocations.filter((x) => x.op === f.op && x.field === f.field).length,
}));

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log(`collection : ${collectionPath.replace(`${root}/`, '')}`);
console.log(`environment: ${environmentPath.replace(`${root}/`, '')}\n`);

console.log('Folder'.padEnd(32) + 'Requests'.padStart(9) + 'Tests'.padStart(8));
const folders = [...new Set(requests.map((r) => r.folder))];
let totalTests = 0;
for (const f of folders) {
  const rs = requests.filter((r) => r.folder === f);
  const tests = rs.reduce((n, r) => n + r.testCount, 0);
  totalTests += tests;
  console.log(pad(f, 32) + String(rs.length).padStart(9) + String(tests).padStart(8));
}
console.log(pad('TOTAL (per-request pm.test)', 32) + String(requests.length).padStart(9) + String(totalTests).padStart(8));
console.log('  + 2 collection-level pm.test per request (no 5xx, response time)\n');

console.log('REST / HTTP routes (from source)');
for (const { route, hits } of routeResults) {
  console.log(`  ${hits > 0 ? 'ok ' : 'MISSING'} ${pad(route.service, 20)} ${pad(route.method, 6)} ${pad(route.path, 40)} ${hits} req`);
  if (hits === 0) fail(`route not covered: ${route.service} ${route.method} ${route.path} (${route.origin})`);
}
console.log('\nGraphQL root fields (from typedefs.ts)');
for (const f of gqlResults) {
  console.log(`  ${f.hits > 0 ? 'ok ' : 'MISSING'} ${pad(f.op, 9)} ${pad(f.field, 24)} ${f.hits} req`);
  if (f.hits === 0) fail(`GraphQL ${f.op} field not covered: ${f.field}`);
}
const unknownGql = gqlInvocations.filter((x) => !x.field.startsWith('__') && !gqlFields.some((f) => f.op === x.op && f.field === x.field));
for (const x of unknownGql) fail(`${x.request}: GraphQL ${x.op} field "${x.field}" is not in typedefs.ts (stale request?)`);

// Requests that don't hit any known route (stale paths) — 404 probes are allowed if named so.
const stale = requestTargets.filter((t) => t.service && !sourceRoutes.some((route) => covers(route, t)));
for (const t of stale) {
  const intentional = t.method === 'OPTIONS' || /unknown route|does-not-exist/i.test(t.r.name);
  if (!intentional) fail(`${t.r.fullName}: ${t.method} /${t.segments.join('/')} matches no route in the source`);
}

const coveredRoutes = routeResults.filter((x) => x.hits > 0).length;
const coveredGql = gqlResults.filter((x) => x.hits > 0).length;
console.log(`\nroutes covered: ${coveredRoutes}/${routeResults.length}`);
console.log(`graphql fields covered: ${coveredGql}/${gqlResults.length}`);
console.log(`requests: ${requests.length}, requests with tests: ${requests.filter((r) => r.testCount > 0).length}/${requests.length}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK');
