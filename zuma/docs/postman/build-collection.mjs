#!/usr/bin/env node
// Generates zuma.postman_collection.json (Postman Collection v2.1) from this file.
// Edit requests HERE, then run:  node docs/postman/build-collection.mjs  (from zuma/)
// and verify with:               node scripts/check-postman-coverage.mjs
//
// The collection is a self-contained end-to-end scenario: folders run in order, create their own
// data, and chain ids through collection variables. Auth tokens are minted by the collection-level
// pre-request script (HS256 via CryptoJS, or fetched from a mock OIDC server when authMode=oidc).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// Constants derived from the code (keep in sync with services/*/src and shared/*/src)
// ---------------------------------------------------------------------------------------------
// Valid testnet P2WPKH (BIP-173 vector), verified with transaction-service isValidAddressForNetwork.
const VALID_TESTNET_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
// Valid mainnet address: passes the JSON-schema shape check, fails the testnet network check.
const MAINNET_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
// Valid shape, bad bech32 checksum (last char changed).
const BAD_CHECKSUM_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsy';
const MISSING_OBJECT_ID = 'ffffffffffffffffffffffff';

const OBJECT_ID = '^[a-f0-9]{24}$';
const SATS_BALANCE = '^(0|[1-9][0-9]{0,15})$';

// ---------------------------------------------------------------------------------------------
// JSON schemas used by pm.response.to.have.jsonSchema (no `format`, the sandbox Ajv may lack it)
// ---------------------------------------------------------------------------------------------
const errorSchema = {
  type: 'object',
  required: ['statusCode', 'code', 'message'],
  properties: {
    statusCode: { type: 'number' },
    code: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'object' },
  },
};

const walletSchema = {
  type: 'object',
  required: ['id', 'label', 'address', 'network', 'type', 'balanceCache', 'metadata', 'ownerUserId', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID },
    label: { type: 'string', minLength: 1 },
    address: { type: 'string', minLength: 14 },
    network: { enum: ['mainnet', 'testnet', 'regtest'] },
    type: { enum: ['hot', 'cold', 'custodial', 'non-custodial'] },
    balanceCache: { type: 'string', pattern: SATS_BALANCE },
    metadata: { type: 'object' },
    ownerUserId: { type: 'string' },
    status: { enum: ['active', 'suspended', 'archived'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const pageOf = (items) => ({
  type: 'object',
  required: ['items', 'total', 'page', 'limit', 'totalPages'],
  properties: {
    items: { type: 'array', items },
    total: { type: 'number' },
    page: { type: 'number' },
    limit: { type: 'number' },
    totalPages: { type: 'number' },
  },
});

const balanceSchema = {
  type: 'object',
  required: ['walletId', 'balanceCache'],
  properties: { walletId: { type: 'string', pattern: OBJECT_ID }, balanceCache: { type: 'string', pattern: SATS_BALANCE } },
};

const txSchema = {
  type: 'object',
  required: ['id', 'walletId', 'txid', 'type', 'amount', 'feeRate', 'status', 'confirmations', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID },
    walletId: { type: 'string', pattern: OBJECT_ID },
    txid: { type: ['string', 'null'] },
    type: { enum: ['send', 'receive', 'internal-transfer'] },
    amount: { type: 'string', pattern: '^[1-9][0-9]{0,15}$' },
    feeRate: { type: 'string' },
    feeSats: { type: 'string', pattern: SATS_BALANCE },
    destinationAddress: { type: 'string' },
    status: { enum: ['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed'] },
    failureReason: { type: ['string', 'null'] },
    confirmations: { type: 'number' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  not: { required: ['rawTx'] },
};

const internalWalletSchema = {
  type: 'object',
  required: ['id', 'ownerUserId', 'status', 'network', 'address'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID },
    ownerUserId: { type: 'string' },
    status: { enum: ['active', 'suspended', 'archived'] },
    network: { enum: ['mainnet', 'testnet', 'regtest'] },
    address: { type: 'string' },
  },
};

const gqlWalletSchema = {
  type: 'object',
  required: ['id', 'label', 'address', 'network', 'type', 'balanceCache', 'metadata', 'ownerUserId', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID },
    network: { enum: ['MAINNET', 'TESTNET', 'REGTEST'] },
    type: { enum: ['HOT', 'COLD', 'CUSTODIAL', 'NON_CUSTODIAL'] },
    status: { enum: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] },
    balanceCache: { type: 'string', pattern: SATS_BALANCE },
    metadata: { type: 'object' },
  },
};

const gqlTxSchema = {
  type: 'object',
  required: ['id', 'walletId', 'txid', 'type', 'amount', 'feeRate', 'status', 'confirmations', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: OBJECT_ID },
    type: { enum: ['SEND', 'RECEIVE', 'INTERNAL_TRANSFER'] },
    status: { enum: ['PENDING', 'BROADCASTING', 'BROADCAST', 'CONFIRMED', 'FAILED'] },
    confirmations: { type: 'integer' },
  },
};

const gqlConnection = (items) => ({
  type: 'object',
  required: ['items', 'pageInfo'],
  properties: {
    items: { type: 'array', items },
    pageInfo: {
      type: 'object',
      required: ['total', 'page', 'limit', 'totalPages'],
      properties: { total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' }, totalPages: { type: 'integer' } },
    },
  },
});

const WALLET_FIELDS = 'id label address network type balanceCache metadata ownerUserId status createdAt updatedAt';
const TX_FIELDS = 'id walletId txid type amount feeRate status confirmations createdAt updatedAt';

// ---------------------------------------------------------------------------------------------
// Test snippet emitters (return JS source lines for Postman scripts)
// ---------------------------------------------------------------------------------------------
const js = JSON.stringify;
const S = {
  status: (n) => `pm.test('status is ${n}', function () { pm.response.to.have.status(${n}); });`,
  statusOneOf: (arr) =>
    `pm.test('status is one of ${arr.join('/')}', function () { pm.expect(${js(arr)}).to.include(pm.response.code); });`,
  // Uses the sandbox's built-in Ajv (pm.response.to.have.jsonSchema); no deprecated tv4.
  schema: (name, schema) =>
    `pm.test('${name} matches JSON schema', function () { pm.response.to.have.jsonSchema(${js(schema)}); });`,
  // Schema check for data.<field> of a GraphQL response (wraps the field schema).
  gqlSchema: (field, schema) =>
    S.schema(
      `data.${field}`,
      { type: 'object', required: ['data'], properties: { data: { type: 'object', required: [field], properties: { [field]: schema } } } },
    ),
  error: (status, code) => [
    S.status(status),
    `pm.test('error body has code ${code}', function () {
  pm.response.to.have.jsonSchema(${js(errorSchema)});
  const b = pm.response.json();
  pm.expect(b.code).to.eql('${code}');
  pm.expect(b.statusCode).to.eql(${status});
  pm.expect(b).to.not.have.property('stack');
});`,
  ],
  gqlOk: (field) => [
    S.status(200),
    `pm.test('no GraphQL errors and data.${field} present', function () {
  const b = pm.response.json();
  pm.expect(b.errors, JSON.stringify(b.errors)).to.be.undefined;
  pm.expect(b.data).to.have.property('${field}');
  pm.expect(b.data['${field}']).to.not.be.null;
});`,
  ],
  gqlError: (code, status = 200) => [
    S.status(status),
    `pm.test('GraphQL error extensions.code is ${code}', function () {
  const b = pm.response.json();
  pm.expect(b.errors).to.be.an('array').that.is.not.empty;
  pm.expect(b.errors[0].extensions, JSON.stringify(b.errors[0])).to.be.an('object');
  pm.expect(b.errors[0].extensions.code).to.eql('${code}');
  pm.expect(b.errors[0].message).to.be.a('string').and.not.match(/at .+\\.(js|ts):\\d+/);
});`,
  ],
  gqlValidation: (pattern) => [
    S.status(400),
    `pm.test('GraphQL validation error matches ${pattern.replace(/'/g, '')}', function () {
  const b = pm.response.json();
  pm.expect(b.data == null).to.be.true;
  pm.expect(b.errors).to.be.an('array').that.is.not.empty;
  pm.expect(b.errors.map(function (e) { return e.message; }).join(' | ')).to.match(${pattern});
});`,
  ],
  noAcao: () =>
    `pm.test('no Access-Control-Allow-Origin for this origin', function () {
  const acao = pm.response.headers.get('Access-Control-Allow-Origin');
  pm.expect(acao === undefined || acao === null || acao === '').to.be.true;
});`,
};

// ---------------------------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------------------------
const AUTH = {
  owner: '{{ownerToken}}',
  other: '{{otherUserToken}}',
  admin: '{{adminToken}}',
  auditor: '{{auditorToken}}',
};

const toUrl = (raw) => {
  const [base, query] = raw.split('?');
  const parts = base.split('/');
  const host = [parts[0]];
  const path = parts.slice(1).filter((p) => p !== '');
  const url = { raw, host, path };
  if (query) {
    url.query = query.split('&').map((kv) => {
      const [key, ...rest] = kv.split('=');
      return { key, value: rest.join('=') };
    });
  }
  return url;
};

const lines = (code) => (Array.isArray(code) ? code.flat() : [code]).join('\n').split('\n');

const request = (name, opts) => {
  const {
    method = 'GET',
    url,
    auth = 'owner',
    headers = {},
    body,
    graphql,
    pre,
    tests,
    description,
  } = opts;
  if (!tests || lines(tests).join('').indexOf('pm.test(') === -1) {
    throw new Error(`request "${name}" has no pm.test assertions`);
  }
  const header = Object.entries(headers).map(([key, value]) => ({ key, value, type: 'text' }));
  const req = { method, header, url: toUrl(url) };
  if (description) req.description = description;

  if (auth === 'none') {
    req.auth = { type: 'noauth' };
  } else {
    const token = AUTH[auth] ?? auth;
    req.auth = { type: 'bearer', bearer: [{ key: 'token', value: token, type: 'string' }] };
  }

  if (graphql) {
    if (!headers['Content-Type']) header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
    req.body = {
      mode: 'graphql',
      graphql: { query: graphql.query.trim(), variables: js(graphql.variables ?? {}, null, 2) },
    };
  } else if (body !== undefined) {
    if (!headers['Content-Type']) header.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
    req.body = {
      mode: 'raw',
      raw: typeof body === 'string' ? body : js(body, null, 2),
      options: { raw: { language: typeof body === 'string' ? 'text' : 'json' } },
    };
  }

  let testLines = lines(tests);
  if (auth === 'auditor') {
    testLines = [
      "if (!pm.collectionVariables.get('auditorToken')) {",
      "  pm.test.skip('auditor persona unavailable (OIDC: add a zuma-auditor scope mapping to deploy/mock-oidc/config.json)', function () {});",
      '} else {',
      ...testLines.map((l) => `  ${l}`),
      '}',
    ];
  }
  const event = [];
  if (pre) event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(pre) } });
  event.push({ listen: 'test', script: { type: 'text/javascript', exec: testLines } });
  return { name, event, request: req, response: [] };
};

const folder = (name, description, item) => ({ name, description, item });

// Shorthands
const W = '{{walletUrl}}';
const TX = '{{transactionUrl}}';
const GW = '{{gatewayUrl}}';
const guid = (v) => `pm.collectionVariables.set('${v}', pm.variables.replaceIn('{{$guid}}'));`;
const randomObjectId = (v) =>
  `pm.collectionVariables.set('${v}', Array.from({ length: 24 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join(''));`;

// ---------------------------------------------------------------------------------------------
// Collection-level scripts
// ---------------------------------------------------------------------------------------------
const collectionPreRequest = String.raw`// zuma collection pre-request: mints/refreshes auth tokens before EVERY request.
// Variables come from the environment (or newman --env-var); results go to collection variables.
//   authMode=hs256: HS256 user JWTs signed with jwtSecret, exactly as shared/http/src/auth.ts verifies
//                   them (alg HS256, iss=jwtIssuer, aud=jwtAudience if set, sub+exp required, roles[]).
//                   Use against a stack WITHOUT JWT_JWKS_URI (zuma/docker-compose.yml on its own).
//   authMode=oidc : RS256 user tokens fetched from the mock OIDC token endpoint (client_credentials, one
//                   scope per persona, claims mapped in deploy/mock-oidc/config.json). Use against a stack
//                   WITH JWT_JWKS_URI (root docker-compose.yml / Terraform). A stack accepts one or the other.
// Actual user ids (token sub) are exposed as ownerUserId / otherUserId / adminUserId / auditorUserId.
// Service tokens (x-service-token for /internal/*) are always HS256 over internalJwtSecret, exactly as
// shared/http/src/service-auth.ts signs them ({sub, aud, role:'service', iss, iat, exp}).
const cv = pm.collectionVariables;
const v = function (k, d) {
  const x = pm.variables.get(k);
  return x === undefined || x === null || x === '' ? (d === undefined ? '' : d) : String(x);
};
const now = Math.floor(Date.now() / 1000);
const ttl = Math.min(Math.max(parseInt(v('jwtTtlSeconds', '300'), 10) || 300, 30), 3600);

const b64url = function (wordArray) {
  return CryptoJS.enc.Base64.stringify(wordArray).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
};
const segment = function (obj) { return b64url(CryptoJS.enc.Utf8.parse(JSON.stringify(obj))); };
const signHs256 = function (claims, secret, header) {
  const input = segment(header || { alg: 'HS256', typ: 'JWT' }) + '.' + segment(claims);
  return input + '.' + b64url(CryptoJS.HmacSHA256(input, secret));
};
const decodePayload = function (jwt) {
  const part = String(jwt).split('.')[1] || '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);
  return JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(b64)));
};

// token variable -> persona. idVar receives the token's sub; role is what the persona must (not) carry.
const personas = {
  ownerToken: { idVar: 'ownerUserId', sub: v('ownerSub', 'user-alice'), roles: [], scope: v('ownerOidcScope', 'zuma-user') },
  otherUserToken: { idVar: 'otherUserId', sub: v('otherUserSub', 'user-bob'), roles: [], scope: v('otherUserOidcScope', 'zuma-user-2') },
  adminToken: { idVar: 'adminUserId', sub: v('adminSub', 'user-admin'), roles: ['admin'], scope: v('adminOidcScope', 'zuma-admin') },
  auditorToken: { idVar: 'auditorUserId', sub: v('auditorSub', 'user-auditor'), roles: ['auditor'], scope: v('auditorOidcScope', 'zuma-auditor') },
};
const PRIVILEGED = ['admin', 'auditor'];

const userClaims = function (p, overrides) {
  const c = { sub: p.sub, roles: p.roles, iss: v('jwtIssuer', 'zuma'), iat: now, exp: now + ttl };
  if (v('jwtAudience')) c.aud = v('jwtAudience');
  return Object.assign(c, overrides || {});
};

const mode = v('authMode', 'hs256').toLowerCase();
const jwtSecret = v('jwtSecret');

if (mode === 'hs256') {
  if (!jwtSecret) {
    console.warn('[zuma] jwtSecret is empty: user tokens not minted (authenticated requests will get 401)');
  } else {
    Object.keys(personas).forEach(function (name) {
      const p = personas[name];
      cv.set(name, signHs256(userClaims(p), jwtSecret));
      cv.set(p.idVar, p.sub);
      cv.set(name + 'Mode', 'hs256');
    });
  }
} else if (mode === 'oidc') {
  const tokenUrl = v('oidcTokenUrl', 'http://localhost:8090/zuma/token');
  Object.keys(personas).forEach(function (name) {
    const p = personas[name];
    const cachedExp = parseInt(cv.get(name + 'Exp') || '0', 10);
    if (cv.get(name + 'Mode') === 'oidc' && cachedExp - 30 > now) return; // cached (or known-unavailable)
    const header = [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }];
    // Only needed for IdPs that derive iss from the Host header; the zhios dev IdP pins it via $ISSUER.
    if (v('oidcHostHeader')) header.push({ key: 'Host', value: v('oidcHostHeader') });
    pm.sendRequest({
      url: tokenUrl,
      method: 'POST',
      header: header,
      body: {
        mode: 'urlencoded',
        urlencoded: [
          { key: 'grant_type', value: 'client_credentials' },
          { key: 'client_id', value: v('oidcClientId', 'zuma-postman') },
          { key: 'client_secret', value: v('oidcClientSecret', 'mock-not-a-secret') },
          { key: 'scope', value: p.scope },
        ],
      },
    }, function (err, res) {
      cv.set(name + 'Mode', 'oidc');
      if (err || res.code !== 200) {
        console.error('[zuma] OIDC token request failed for ' + name + ': ' + (err ? err.message : res.code));
        cv.unset(name);
        cv.unset(p.idVar);
        cv.set(name + 'Exp', String(now + 30));
        return;
      }
      const body = res.json();
      let claims = {};
      try { claims = decodePayload(body.access_token); } catch (e) { claims = {}; }
      const roles = Array.isArray(claims.roles) ? claims.roles : [];
      const wanted = p.roles[0];
      const ok = typeof claims.sub === 'string' && claims.sub.length > 0 &&
        (wanted ? roles.indexOf(wanted) !== -1 : !roles.some(function (r) { return PRIVILEGED.indexOf(r) !== -1; }));
      if (!ok) {
        // e.g. no 'zuma-auditor' mapping in deploy/mock-oidc/config.json: persona-specific checks are skipped.
        console.warn('[zuma] OIDC token for ' + name + ' (scope ' + p.scope + ') lacks the expected sub/roles; persona disabled');
        cv.unset(name);
        cv.unset(p.idVar);
      } else {
        cv.set(name, body.access_token);
        cv.set(p.idVar, claims.sub);
      }
      cv.set(name + 'Exp', String(Math.min(parseInt(claims.exp, 10) || now + 300, now + (parseInt(body.expires_in, 10) || 300))));
    });
  });
} else {
  console.error('[zuma] unknown authMode "' + mode + '" (expected hs256 or oidc)');
}

// Negative user tokens (always HS256-shaped; rejected in both auth modes).
const forgedSecret = 'not-the-real-secret-' + (jwtSecret ? jwtSecret.length : 0) + '-xxxxxxxxxxxxxxxx';
cv.set('badSignatureToken', signHs256(userClaims(personas.ownerToken), forgedSecret));
// Signed with jwtSecret when available (so ONLY the tested property is wrong); in OIDC/JWKS mode any
// HS256 token is rejected by the algorithm allow-list anyway.
const negSecret = jwtSecret || forgedSecret;
cv.set('expiredToken', signHs256(userClaims(personas.ownerToken, { iat: now - 7200, exp: now - 3600 }), negSecret));
cv.set('wrongIssuerToken', signHs256(userClaims(personas.ownerToken, { iss: 'not-zuma' }), negSecret));
cv.set('noSubToken', signHs256({ roles: [], iss: v('jwtIssuer', 'zuma'), iat: now, exp: now + ttl }, negSecret));
cv.set('algNoneToken', segment({ alg: 'none', typ: 'JWT' }) + '.' + segment(userClaims(personas.ownerToken)) + '.');

// Service tokens for wallet-service /internal/* (caller transaction-service, audience wallet-service).
const internalSecret = v('internalJwtSecret');
const serviceClaims = function (sub, aud, overrides) {
  return Object.assign({ sub: sub, aud: aud, role: 'service', iss: v('internalJwtIssuer', 'zuma-internal'), iat: now, exp: now + 60 }, overrides || {});
};
if (internalSecret.length >= 32) {
  cv.set('serviceToken', signHs256(serviceClaims('transaction-service', 'wallet-service'), internalSecret));
  cv.set('serviceTokenWrongCaller', signHs256(serviceClaims('graphql-gateway', 'wallet-service'), internalSecret));
  cv.set('serviceTokenWrongAudience', signHs256(serviceClaims('transaction-service', 'transaction-service'), internalSecret));
  cv.set('serviceTokenExpired', signHs256(serviceClaims('transaction-service', 'wallet-service', { iat: now - 600, exp: now - 300 }), internalSecret));
  cv.set('serviceTokenWrongRole', signHs256(serviceClaims('transaction-service', 'wallet-service', { role: 'user' }), internalSecret));
} else {
  console.warn('[zuma] internalJwtSecret empty or < 32 chars: service tokens not minted (/internal/* requests will get 401)');
}
// A user JWT is never a valid service token.
cv.set('userTokenAsServiceToken', cv.get('ownerToken') || 'none');
`;

const collectionTest = `// zuma collection-level test: runs after EVERY request.
pm.test('[global] no 5xx response', function () { pm.expect(pm.response.code).to.be.below(500); });
pm.test('[global] response time under ' + (pm.variables.get('maxResponseMs') || 5000) + 'ms', function () {
  pm.expect(pm.response.responseTime).to.be.below(parseInt(pm.variables.get('maxResponseMs') || '5000', 10));
});
`;

// ---------------------------------------------------------------------------------------------
// 0 Health
// ---------------------------------------------------------------------------------------------
const services = [
  ['wallet-service', W],
  ['transaction-service', TX],
  ['graphql-gateway', GW],
];

const metricsNoToken = (svc, base) =>
  request(`${svc} GET /metrics without token`, {
    url: `${base}/metrics`,
    auth: 'none',
    description: 'With METRICS_TOKEN configured (always in production), /metrics requires `Authorization: Bearer <METRICS_TOKEN>`.',
    tests: `const tokenConfigured = !!pm.variables.get('metricsToken');
pm.test('unauthenticated /metrics is ' + (tokenConfigured ? '401' : '200 (no METRICS_TOKEN configured)'), function () {
  pm.response.to.have.status(tokenConfigured ? 401 : 200);
});
if (pm.response.code === 401) {
  pm.test('401 body + WWW-Authenticate: Bearer', function () {
    pm.expect(pm.response.json().code).to.eql('UNAUTHORIZED');
    pm.expect(pm.response.headers.get('WWW-Authenticate')).to.eql('Bearer');
  });
}`,
  });

const metricsWithToken = (svc, base) =>
  request(`${svc} GET /metrics with token`, {
    url: `${base}/metrics`,
    auth: '{{metricsToken}}',
    tests: `if (!pm.variables.get('metricsToken')) {
  pm.test.skip('metricsToken not set: skipping authenticated scrape', function () {});
  pm.test('scrape reachable without token (no METRICS_TOKEN)', function () { pm.response.to.have.status(200); });
} else {
  pm.test('status is 200', function () { pm.response.to.have.status(200); });
  pm.test('Prometheus exposition format', function () {
    pm.expect(pm.response.headers.get('Content-Type')).to.match(/^text[/]plain/);
    const text = pm.response.text();
    pm.expect(text).to.include('http_request_duration_seconds');
    pm.expect(text).to.include('process_cpu');
  });
}`,
  });

const healthFolder = folder(
  '0 Health',
  'Liveness/readiness probes, Prometheus /metrics (with and without METRICS_TOKEN) and API docs. Standalone: needs no data.',
  [
    ...services.flatMap(([svc, base]) => [
      request(`${svc} GET /healthz`, {
        url: `${base}/healthz`,
        auth: 'none',
        tests: [
          S.status(200),
          `pm.test('liveness body is {status: ok}', function () { pm.expect(pm.response.json()).to.eql({ status: 'ok' }); });`,
          `pm.test('probe is not rate limited', function () { pm.expect(pm.response.headers.has('x-ratelimit-limit')).to.be.false; });`,
        ],
      }),
      request(`${svc} GET /readyz`, {
        url: `${base}/readyz`,
        auth: 'none',
        description: svc === 'graphql-gateway' ? 'Ready only when both upstream /healthz respond.' : 'Ready only when MongoDB answers a ping.',
        tests: [
          S.status(200),
          `pm.test('readiness body is {status: ok} (failure reasons are never returned)', function () { pm.expect(pm.response.json()).to.eql({ status: 'ok' }); });`,
        ],
      }),
      metricsNoToken(svc, base),
      metricsWithToken(svc, base),
    ]),
    ...[
      ['wallet-service', W, ['/api/v1/wallets', '/api/v1/admin/wallets/{id}/deposits', '/internal/wallets/{id}/debits']],
      ['transaction-service', TX, ['/api/v1/transactions', '/api/v1/transactions/{id}/broadcast']],
    ].flatMap(([svc, base, paths]) => [
      request(`${svc} GET /docs (Swagger UI)`, {
        url: `${base}/docs`,
        auth: 'none',
        description: 'Served when DOCS_ENABLED (default on outside production). Set expectDocs=false for production-like stacks.',
        tests: `const expectDocs = (pm.variables.get('expectDocs') || 'true') === 'true';
pm.test('docs ' + (expectDocs ? 'reachable' : 'disabled (404)'), function () { pm.response.to.have.status(expectDocs ? 200 : 404); });
if (expectDocs) pm.test('HTML UI', function () { pm.expect(pm.response.headers.get('Content-Type')).to.match(/^text[/]html/); });`,
      }),
      request(`${svc} GET /docs/json (OpenAPI)`, {
        url: `${base}/docs/json`,
        auth: 'none',
        tests: `const expectDocs = (pm.variables.get('expectDocs') || 'true') === 'true';
pm.test('OpenAPI ' + (expectDocs ? 'served' : 'disabled (404)'), function () { pm.response.to.have.status(expectDocs ? 200 : 404); });
if (expectDocs) {
  pm.test('OpenAPI 3 document lists the service routes', function () {
    const doc = pm.response.json();
    pm.expect(doc.openapi).to.match(/^3\\./);
    pm.expect(doc.components.securitySchemes).to.have.property('bearerAuth');
    ${js(paths)}.forEach(function (p) { pm.expect(doc.paths, p).to.have.property(p); });
  });
}`,
      }),
    ]),
    request('graphql-gateway GET /graphiql', {
      url: `${GW}/graphiql`,
      auth: 'none',
      description: 'GraphiQL is served only outside production.',
      tests: `const expectDocs = (pm.variables.get('expectDocs') || 'true') === 'true';
pm.test('GraphiQL ' + (expectDocs ? 'reachable' : 'disabled (404)'), function () { pm.response.to.have.status(expectDocs ? 200 : 404); });`,
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 1 Wallets
// ---------------------------------------------------------------------------------------------
const walletsFolder = folder(
  '1 Wallets',
  'Wallet CRUD on wallet-service :3001. Creates the owner (alice) testnet wallet `walletId` and a second-user (bob) wallet `bobWalletId` used by later folders. Non-owners get 404 (never 403) on reads so wallet existence is not confirmed; privileged roles (admin/auditor) can read but not write.',
  [
    request('Create wallet (owner, testnet hot)', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      body: { label: 'Postman Alice Hot', network: 'testnet', type: 'hot', metadata: { purpose: 'postman-e2e', run: '{{runId}}' } },
      pre: [guid('runId')],
      tests: [
        S.status(201),
        S.schema('wallet', walletSchema),
        `const w = pm.response.json();
pm.test('owner is the token sub, not client-supplied', function () { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId')); });
pm.test('new wallet: active, 0 sats, testnet bech32 address', function () {
  pm.expect(w.status).to.eql('active');
  pm.expect(w.balanceCache).to.eql('0');
  pm.expect(w.network).to.eql('testnet');
  pm.expect(w.address).to.match(/^tb1[02-9ac-hj-np-z]{6,87}$/);
  pm.expect(w.metadata.purpose).to.eql('postman-e2e');
});
pm.collectionVariables.set('walletId', w.id);
pm.collectionVariables.set('walletAddress', w.address);
pm.collectionVariables.set('expectedBalance', '0');`,
      ],
    }),
    request('Create wallet (other user, testnet custodial)', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      auth: 'other',
      body: { label: 'Postman Bob Custodial', network: 'testnet', type: 'custodial' },
      tests: [
        S.status(201),
        S.schema('wallet', walletSchema),
        `const w = pm.response.json();
pm.test('owned by the other user', function () { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('otherUserId')); });
pm.test('metadata defaults to {}', function () { pm.expect(w.metadata).to.eql({}); });
pm.collectionVariables.set('bobWalletId', w.id);
pm.collectionVariables.set('bobWalletAddress', w.address);`,
      ],
    }),
    request('Create wallet: missing label → 400', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      body: { network: 'testnet', type: 'hot' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Create wallet: invalid network enum → 400', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      body: { label: 'bad', network: 'signet', type: 'hot' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Create wallet: no token → 401', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      auth: 'none',
      body: { label: 'anon', network: 'testnet', type: 'hot' },
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Get wallet (owner)', {
      url: `${W}/api/v1/wallets/{{walletId}}`,
      tests: [
        S.status(200),
        S.schema('wallet', walletSchema),
        `pm.test('same wallet', function () {
  const w = pm.response.json();
  pm.expect(w.id).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(w.address).to.eql(pm.collectionVariables.get('walletAddress'));
});`,
      ],
    }),
    request('Get wallet (auditor can read)', {
      url: `${W}/api/v1/wallets/{{walletId}}`,
      auth: 'auditor',
      tests: [S.status(200), S.schema('wallet', walletSchema)],
    }),
    request('Get wallet (admin can read)', {
      url: `${W}/api/v1/wallets/{{walletId}}`,
      auth: 'admin',
      tests: [S.status(200), `pm.test('owner unchanged', function () { pm.expect(pm.response.json().ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId')); });`],
    }),
    request("Get wallet: other user's wallet → 404 (not 403)", {
      url: `${W}/api/v1/wallets/{{walletId}}`,
      auth: 'other',
      description: 'GetWalletUseCase returns the same 404 as a missing wallet to non-owners, so existence is not confirmed.',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get wallet: no token → 401', {
      url: `${W}/api/v1/wallets/{{walletId}}`,
      auth: 'none',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Get wallet: invalid ObjectId → 400', {
      url: `${W}/api/v1/wallets/not-an-object-id`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Get wallet: unknown id → 404', {
      url: `${W}/api/v1/wallets/${MISSING_OBJECT_ID}`,
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('List wallets (owner, page 1 limit 1)', {
      url: `${W}/api/v1/wallets?page=1&limit=1`,
      tests: [
        S.status(200),
        S.schema('wallet page', pageOf(walletSchema)),
        `const p = pm.response.json();
pm.test('pagination honoured', function () {
  pm.expect(p.page).to.eql(1);
  pm.expect(p.limit).to.eql(1);
  pm.expect(p.items.length).to.be.at.most(1);
  pm.expect(p.total).to.be.at.least(1);
  pm.expect(p.totalPages).to.eql(Math.ceil(p.total / p.limit));
});
pm.test('only wallets owned by the caller', function () {
  p.items.forEach(function (w) { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId')); });
});`,
      ],
    }),
    request('List wallets: non-privileged ownerUserId filter is ignored', {
      url: `${W}/api/v1/wallets?ownerUserId={{ownerUserId}}&limit=100`,
      auth: 'other',
      description: 'ListWalletsUseCase forces ownerUserId = caller for non-privileged actors.',
      tests: [
        S.status(200),
        `pm.test('bob only sees wallets owned by bob', function () {
  const p = pm.response.json();
  p.items.forEach(function (w) { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('otherUserId')); });
  pm.expect(p.items.map(function (w) { return w.id; })).to.include(pm.collectionVariables.get('bobWalletId'));
});`,
      ],
    }),
    request('List wallets: admin filters by ownerUserId', {
      url: `${W}/api/v1/wallets?ownerUserId={{ownerUserId}}&limit=100`,
      auth: 'admin',
      tests: [
        S.status(200),
        S.schema('wallet page', pageOf(walletSchema)),
        `pm.test('all items owned by alice and include walletId', function () {
  const p = pm.response.json();
  p.items.forEach(function (w) { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId')); });
  pm.expect(p.items.map(function (w) { return w.id; })).to.include(pm.collectionVariables.get('walletId'));
});`,
      ],
    }),
    request('List wallets: limit > 100 → 400', {
      url: `${W}/api/v1/wallets?limit=101`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('List wallets: page 0 → 400', {
      url: `${W}/api/v1/wallets?page=0`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Update wallet metadata (owner)', {
      method: 'PATCH',
      url: `${W}/api/v1/wallets/{{walletId}}/metadata`,
      body: { label: 'Postman Alice Hot (renamed)', metadata: { purpose: 'postman-e2e', tier: 'gold' } },
      tests: [
        S.status(200),
        S.schema('wallet', walletSchema),
        `pm.test('label + metadata updated, nothing else', function () {
  const w = pm.response.json();
  pm.expect(w.label).to.eql('Postman Alice Hot (renamed)');
  pm.expect(w.metadata.tier).to.eql('gold');
  pm.expect(w.address).to.eql(pm.collectionVariables.get('walletAddress'));
  pm.expect(w.balanceCache).to.eql('0');
});`,
      ],
    }),
    request('Update wallet metadata: other user → 404', {
      method: 'PATCH',
      url: `${W}/api/v1/wallets/{{walletId}}/metadata`,
      auth: 'other',
      body: { label: 'hijack' },
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Update wallet metadata: auditor → 403', {
      method: 'PATCH',
      url: `${W}/api/v1/wallets/{{walletId}}/metadata`,
      auth: 'auditor',
      // A valid body is required: without one Fastify's schema check answers 400 before the
      // use-case gets to the ownership/role check this request is about.
      body: { label: 'auditor-write-attempt' },
      description: 'Privileged readers get an explicit 403 on writes (they can already see the wallet).',
      tests: S.error(403, 'FORBIDDEN'),
    }),
    request('Update wallet metadata: empty label → 400', {
      method: 'PATCH',
      url: `${W}/api/v1/wallets/{{walletId}}/metadata`,
      body: { label: '' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Update wallet metadata: unknown id → 404', {
      method: 'PATCH',
      url: `${W}/api/v1/wallets/${MISSING_OBJECT_ID}/metadata`,
      body: { label: 'ghost' },
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get wallet balance (owner)', {
      url: `${W}/api/v1/wallets/{{walletId}}/balance`,
      tests: [
        S.status(200),
        S.schema('balance', balanceSchema),
        `pm.test('new wallet balance is "0" (string sats)', function () {
  const b = pm.response.json();
  pm.expect(b.walletId).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(b.balanceCache).to.eql('0');
});`,
      ],
    }),
    request('Get wallet balance: other user → 404', {
      url: `${W}/api/v1/wallets/{{walletId}}/balance`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get wallet transaction history (empty)', {
      url: `${W}/api/v1/wallets/{{walletId}}/transactions`,
      description: 'wallet-service calls transaction-service (forwarding the caller token).',
      tests: [
        S.status(200),
        `pm.test('empty array for a new wallet', function () { pm.expect(pm.response.json()).to.be.an('array').that.is.empty; });`,
      ],
    }),
    request('Get wallet transaction history: other user → 404', {
      url: `${W}/api/v1/wallets/{{walletId}}/transactions`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 2 Admin
// ---------------------------------------------------------------------------------------------
const depositUrl = `${W}/api/v1/admin/wallets/{{walletId}}/deposits`;
const adminFolder = folder(
  '2 Admin',
  'Admin-only dev/test funding: POST /api/v1/admin/wallets/:id/deposits (requireRole admin), idempotent by `reference`. Funds walletId with 100000 sats for folder 3.',
  [
    request('Deposit 100000 sats (admin)', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      pre: `pm.collectionVariables.set('depositRef', 'postman-' + pm.variables.replaceIn('{{$guid}}'));`,
      body: { amountSats: '100000', reference: '{{depositRef}}' },
      tests: [
        S.status(200),
        S.schema('balance', balanceSchema),
        `pm.test('balance credited to 100000', function () {
  const b = pm.response.json();
  pm.expect(b.walletId).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(b.balanceCache).to.eql('100000');
});
pm.collectionVariables.set('expectedBalance', '100000');`,
      ],
    }),
    request('Deposit replay, same reference → same result (idempotent)', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '100000', reference: '{{depositRef}}' },
      tests: [
        S.status(200),
        `pm.test('not credited twice', function () { pm.expect(pm.response.json().balanceCache).to.eql('100000'); });`,
      ],
    }),
    request('Deposit same reference, different amount → 409', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '5', reference: '{{depositRef}}' },
      tests: S.error(409, 'IDEMPOTENCY_CONFLICT'),
    }),
    request('Deposit as wallet owner (non-admin) → 403', {
      method: 'POST',
      url: depositUrl,
      body: { amountSats: '1000', reference: 'postman-self-fund-attempt' },
      tests: S.error(403, 'FORBIDDEN'),
    }),
    request('Deposit as auditor → 403', {
      method: 'POST',
      url: depositUrl,
      auth: 'auditor',
      body: { amountSats: '1000', reference: 'postman-auditor-attempt' },
      tests: S.error(403, 'FORBIDDEN'),
    }),
    request('Deposit without token → 401', {
      method: 'POST',
      url: depositUrl,
      auth: 'none',
      body: { amountSats: '1000', reference: 'postman-anon-attempt' },
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Deposit amount "0" → 400', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '0', reference: 'postman-zero' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Deposit non-integer amount → 400', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '1.5', reference: 'postman-fraction' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Deposit above max supply digits → 400', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '99999999999999999', reference: 'postman-too-big' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Deposit missing reference → 400', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '1000' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Deposit reference with illegal chars → 400', {
      method: 'POST',
      url: depositUrl,
      auth: 'admin',
      body: { amountSats: '1000', reference: 'bad ref!' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Deposit to unknown wallet → 404', {
      method: 'POST',
      url: `${W}/api/v1/admin/wallets/${MISSING_OBJECT_ID}/deposits`,
      auth: 'admin',
      pre: `pm.collectionVariables.set('ghostDepositRef', 'postman-ghost-' + pm.variables.replaceIn('{{$guid}}'));`,
      body: { amountSats: '1000', reference: '{{ghostDepositRef}}' },
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Balance after deposit (owner)', {
      url: `${W}/api/v1/wallets/{{walletId}}/balance`,
      tests: [
        S.status(200),
        `pm.test('balance is 100000', function () { pm.expect(pm.response.json().balanceCache).to.eql('100000'); });`,
      ],
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 3 Transactions
// ---------------------------------------------------------------------------------------------
const createTx = (name, { body, key = '{{$guid}}', auth = 'owner', tests, pre, headers }) =>
  request(name, {
    method: 'POST',
    url: `${TX}/api/v1/transactions`,
    auth,
    headers: headers ?? { 'Idempotency-Key': key },
    body,
    pre,
    tests,
  });

const sendBody = (overrides = {}) => ({
  walletId: '{{walletId}}',
  type: 'send',
  amount: '{{txAmount}}',
  feeRate: '{{txFeeRate}}',
  destinationAddress: '{{bobWalletAddress}}',
  ...overrides,
});

const txFolder = folder(
  '3 Transactions',
  'Send lifecycle on transaction-service :3002: create (Idempotency-Key required) → validate → broadcast → status, plus every validation/ownership/idempotency negative. Requires folders 1 and 2 (funded walletId). Mock node fee = feeRate × 141 vB.',
  [
    createTx('Create send (Idempotency-Key) → 201 pending, funds reserved', {
      pre: [
        guid('txIdemKey'),
        `pm.collectionVariables.set('txAmount', '10000');
pm.collectionVariables.set('txFeeRate', '2');
pm.collectionVariables.set('txFrom', new Date(Date.now() - 3600 * 1000).toISOString());`,
      ],
      key: '{{txIdemKey}}',
      body: sendBody(),
      tests: [
        S.status(201),
        S.schema('transaction', txSchema),
        `const t = pm.response.json();
pm.test('pending send, not yet broadcast', function () {
  pm.expect(t.type).to.eql('send');
  pm.expect(t.status).to.eql('pending');
  pm.expect(t.txid).to.be.null;
  pm.expect(t.confirmations).to.eql(0);
  pm.expect(t.walletId).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(t.amount).to.eql('10000');
  pm.expect(t.feeRate).to.eql('2');
  pm.expect(t.destinationAddress).to.eql(pm.collectionVariables.get('bobWalletAddress'));
});
pm.test('feeSats is integer sats (mock node: feeRate x 141)', function () {
  pm.expect(t.feeSats).to.match(/^(0|[1-9][0-9]*)$/);
  if ((pm.variables.get('mockBitcoinNode') || 'true') === 'true') pm.expect(t.feeSats).to.eql('282');
});
pm.test('rawTx never leaves the service', function () { pm.expect(t).to.not.have.property('rawTx'); });
pm.collectionVariables.set('transactionId', t.id);
pm.collectionVariables.set('txFeeSats', t.feeSats);
const expected = parseInt(pm.collectionVariables.get('expectedBalance') || '0', 10) - parseInt(t.amount, 10) - parseInt(t.feeSats, 10);
pm.collectionVariables.set('expectedBalance', String(expected));`,
      ],
    }),
    createTx('Replay same Idempotency-Key + body → same transaction', {
      key: '{{txIdemKey}}',
      body: sendBody(),
      tests: [
        S.status(201),
        `pm.test('original transaction returned, not a new one', function () {
  const t = pm.response.json();
  pm.expect(t.id).to.eql(pm.collectionVariables.get('transactionId'));
  pm.expect(t.status).to.eql('pending');
});`,
      ],
    }),
    createTx('Same Idempotency-Key, different body → 409 IDEMPOTENCY_CONFLICT', {
      key: '{{txIdemKey}}',
      body: sendBody({ amount: '20000' }),
      tests: S.error(409, 'IDEMPOTENCY_CONFLICT'),
    }),
    createTx('Missing Idempotency-Key → 400', {
      headers: {},
      body: sendBody(),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Idempotency-Key too short → 400', {
      key: 'short',
      body: sendBody(),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('type "receive" → 400 (only sends via API)', {
      body: sendBody({ type: 'receive' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Non-integer sats amount → 400', {
      body: sendBody({ amount: '1.5' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Zero amount → 400', {
      body: sendBody({ amount: '0' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Mainnet destination for testnet wallet → 400', {
      body: sendBody({ destinationAddress: MAINNET_ADDRESS }),
      tests: [
        ...S.error(400, 'VALIDATION_ERROR'),
        `pm.test('message names the wallet network', function () { pm.expect(pm.response.json().message).to.match(/testnet/); });`,
      ],
    }),
    createTx('Bad bech32 checksum destination → 400', {
      body: sendBody({ destinationAddress: BAD_CHECKSUM_ADDRESS }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Malformed destination (shape) → 400', {
      body: sendBody({ destinationAddress: 'not-a-bitcoin-address' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('feeRate 0 → 400 (bounds 1..10000)', {
      body: sendBody({ feeRate: '0' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('feeRate 10001 → 400 (bounds 1..10000)', {
      body: sendBody({ feeRate: '10001' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Invalid walletId ObjectId → 400', {
      body: sendBody({ walletId: 'xyz' }),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    createTx('Insufficient funds → 409, recorded as failed', {
      pre: guid('failedTxKey'),
      key: '{{failedTxKey}}',
      body: sendBody({ amount: '99999999', destinationAddress: VALID_TESTNET_ADDRESS }),
      tests: S.error(409, 'INSUFFICIENT_FUNDS'),
    }),
    createTx('Insufficient funds replay → 409 again (persisted failure)', {
      key: '{{failedTxKey}}',
      body: sendBody({ amount: '99999999', destinationAddress: VALID_TESTNET_ADDRESS }),
      tests: S.error(409, 'INSUFFICIENT_FUNDS'),
    }),
    request('List failed transactions → contains the insufficient-funds send', {
      url: `${TX}/api/v1/transactions?walletId={{walletId}}&status=failed&limit=100`,
      tests: [
        S.status(200),
        S.schema('transaction page', pageOf(txSchema)),
        `pm.test('failed send with failureReason INSUFFICIENT_FUNDS', function () {
  const items = pm.response.json().items;
  const failed = items.filter(function (t) { return t.amount === '99999999'; });
  pm.expect(failed.length).to.eql(1);
  pm.expect(failed[0].status).to.eql('failed');
  pm.expect(failed[0].failureReason).to.eql('INSUFFICIENT_FUNDS');
});`,
      ],
    }),
    createTx("Send from another user's wallet → 403", {
      auth: 'other',
      body: sendBody(),
      tests: S.error(403, 'FORBIDDEN'),
    }),
    createTx("Send from owner's wallet as auditor → 403 (read access ≠ spend)", {
      auth: 'auditor',
      body: sendBody(),
      tests: S.error(403, 'FORBIDDEN'),
    }),
    createTx('Send from unknown wallet → 403 (indistinguishable from not-owned)', {
      body: sendBody({ walletId: MISSING_OBJECT_ID }),
      tests: S.error(403, 'FORBIDDEN'),
    }),
    createTx('Create without token → 401', {
      auth: 'none',
      body: sendBody(),
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Balance decreased by amount + fee', {
      url: `${W}/api/v1/wallets/{{walletId}}/balance`,
      tests: [
        S.status(200),
        `pm.test('balance = 100000 - amount - feeSats (failed send did not debit)', function () {
  const amount = parseInt(pm.collectionVariables.get('txAmount'), 10);
  const fee = parseInt(pm.collectionVariables.get('txFeeSats'), 10);
  pm.expect(pm.response.json().balanceCache).to.eql(String(100000 - amount - fee));
  pm.expect(pm.response.json().balanceCache).to.eql(pm.collectionVariables.get('expectedBalance'));
});`,
      ],
    }),
    request('Validate transaction (owner)', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/validate`,
      tests: [
        S.status(200),
        S.schema('transaction', txSchema),
        `pm.test('still pending, ready to broadcast', function () {
  const t = pm.response.json();
  pm.expect(t.id).to.eql(pm.collectionVariables.get('transactionId'));
  pm.expect(t.status).to.eql('pending');
});`,
      ],
    }),
    request('Validate: other user → 404', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/validate`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get transaction (owner)', {
      url: `${TX}/api/v1/transactions/{{transactionId}}`,
      tests: [
        S.status(200),
        S.schema('transaction', txSchema),
        `pm.test('same transaction, no rawTx', function () {
  const t = pm.response.json();
  pm.expect(t.id).to.eql(pm.collectionVariables.get('transactionId'));
  pm.expect(t).to.not.have.property('rawTx');
});`,
      ],
    }),
    request('Get transaction: other user → 404', {
      url: `${TX}/api/v1/transactions/{{transactionId}}`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get transaction: auditor can read', {
      url: `${TX}/api/v1/transactions/{{transactionId}}`,
      auth: 'auditor',
      tests: [S.status(200), S.schema('transaction', txSchema)],
    }),
    request('Get transaction: invalid ObjectId → 400', {
      url: `${TX}/api/v1/transactions/123`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('Get transaction: unknown id → 404', {
      url: `${TX}/api/v1/transactions/${MISSING_OBJECT_ID}`,
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Get status before broadcast', {
      url: `${TX}/api/v1/transactions/{{transactionId}}/status`,
      tests: [
        S.status(200),
        `pm.test('pending with 0 confirmations', function () {
  const s = pm.response.json();
  pm.expect(s).to.have.all.keys('transactionId', 'status', 'confirmations');
  pm.expect(s.transactionId).to.eql(pm.collectionVariables.get('transactionId'));
  pm.expect(s.status).to.eql('pending');
  pm.expect(s.confirmations).to.eql(0);
});`,
      ],
    }),
    request('Broadcast: other user → 404', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/broadcast`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('Broadcast (owner) → broadcast with txid', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/broadcast`,
      tests: [
        S.status(200),
        S.schema('transaction', txSchema),
        `pm.test('status broadcast, 64-hex txid', function () {
  const t = pm.response.json();
  pm.expect(t.status).to.eql('broadcast');
  pm.expect(t.txid).to.match(/^[0-9a-f]{64}$/);
});
pm.collectionVariables.set('txid', pm.response.json().txid);`,
      ],
    }),
    request('Broadcast again → 409 INVALID_TRANSACTION_STATE', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/broadcast`,
      tests: S.error(409, 'INVALID_TRANSACTION_STATE'),
    }),
    request('Broadcast as auditor → 403 (privileged readers cannot write)', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/broadcast`,
      auth: 'auditor',
      tests: S.error(403, 'FORBIDDEN'),
    }),
    request('Validate after broadcast → 400 (not pending)', {
      method: 'POST',
      url: `${TX}/api/v1/transactions/{{transactionId}}/validate`,
      tests: [
        ...S.error(400, 'VALIDATION_ERROR'),
        `pm.test('details explain the state', function () { pm.expect(pm.response.json().details).to.include({ status: 'broadcast' }); });`,
      ],
    }),
    request('Get status after broadcast', {
      url: `${TX}/api/v1/transactions/{{transactionId}}/status`,
      tests: [
        S.status(200),
        `pm.test('broadcast or confirmed (mock: ~1 conf / 10s)', function () {
  const s = pm.response.json();
  pm.expect(['broadcast', 'confirmed']).to.include(s.status);
  pm.expect(s.confirmations).to.be.within(0, 6);
});`,
      ],
    }),
    request('Get status: other user → 404', {
      url: `${TX}/api/v1/transactions/{{transactionId}}/status`,
      auth: 'other',
      tests: S.error(404, 'NOT_FOUND'),
    }),
    request('List transactions by wallet + date window', {
      url: `${TX}/api/v1/transactions?walletId={{walletId}}&from={{txFrom}}&page=1&limit=20`,
      tests: [
        S.status(200),
        S.schema('transaction page', pageOf(txSchema)),
        `pm.test('contains the broadcast send', function () {
  const p = pm.response.json();
  pm.expect(p.page).to.eql(1);
  pm.expect(p.limit).to.eql(20);
  pm.expect(p.items.map(function (t) { return t.id; })).to.include(pm.collectionVariables.get('transactionId'));
  p.items.forEach(function (t) { pm.expect(t.walletId).to.eql(pm.collectionVariables.get('walletId')); });
});`,
      ],
    }),
    request('List transactions: window in the past → empty', {
      url: `${TX}/api/v1/transactions?walletId={{walletId}}&to=2000-01-01T00:00:00.000Z`,
      tests: [
        S.status(200),
        `pm.test('no items before 2000', function () { const p = pm.response.json(); pm.expect(p.items).to.be.empty; pm.expect(p.total).to.eql(0); });`,
      ],
    }),
    request('List transactions: other user sees none of the owner transactions', {
      url: `${TX}/api/v1/transactions?walletId={{walletId}}`,
      auth: 'other',
      tests: [
        S.status(200),
        `pm.test('scoped to caller', function () { pm.expect(pm.response.json().items).to.be.empty; });`,
      ],
    }),
    request('List transactions: invalid status → 400', {
      url: `${TX}/api/v1/transactions?status=settled`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('List transactions: invalid walletId → 400', {
      url: `${TX}/api/v1/transactions?walletId=nope`,
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    request('List transactions: no token → 401', {
      url: `${TX}/api/v1/transactions`,
      auth: 'none',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Wallet transaction history now includes the send', {
      url: `${W}/api/v1/wallets/{{walletId}}/transactions`,
      tests: [
        S.status(200),
        `pm.test('history lists the broadcast send without rawTx', function () {
  const items = pm.response.json();
  pm.expect(items).to.be.an('array');
  const tx = items.find(function (t) { return t.id === pm.collectionVariables.get('transactionId'); });
  pm.expect(tx, 'transaction in history').to.be.an('object');
  pm.expect(['broadcast', 'confirmed']).to.include(tx.status);
  items.forEach(function (t) { pm.expect(t.rawTx == null).to.be.true; });
});`,
      ],
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 4 Internal service routes
// ---------------------------------------------------------------------------------------------
const svc = (token = '{{serviceToken}}') => ({ 'x-service-token': token });
const internalReq = (name, opts) => request(name, { auth: 'none', ...opts, headers: { ...(opts.headers ?? {}) } });

const internalFolder = folder(
  '4 Internal service routes',
  'wallet-service /internal/* — x-service-token (HS256 over INTERNAL_JWT_SECRET, aud wallet-service, role service), only caller `transaction-service` allowed. Never exposed on the public ingress; run against the service port directly. Requires folders 1-3.',
  [
    internalReq('GET /internal/wallets/:id (service token)', {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc(),
      tests: [
        S.status(200),
        S.schema('internal wallet summary', internalWalletSchema),
        `pm.test('summary only (no balance/metadata/label)', function () {
  const w = pm.response.json();
  pm.expect(w.id).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId'));
  pm.expect(w.network).to.eql('testnet');
  pm.expect(w).to.not.have.any.keys('balanceCache', 'metadata', 'label');
});`,
      ],
    }),
    internalReq('GET /internal/wallets/:id without token → 401', {
      url: `${W}/internal/wallets/{{walletId}}`,
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('GET /internal/wallets/:id with a user JWT → 401', {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc('{{userTokenAsServiceToken}}'),
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('GET /internal/wallets/:id wrong caller (graphql-gateway) → 403', {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc('{{serviceTokenWrongCaller}}'),
      tests: S.error(403, 'FORBIDDEN'),
    }),
    internalReq('GET /internal/wallets/:id wrong audience → 401', {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc('{{serviceTokenWrongAudience}}'),
      description: 'Audience mismatch is a token verification failure (401), not an authorization failure.',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('GET /internal/wallets/:id expired service token → 401', {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc('{{serviceTokenExpired}}'),
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq("GET /internal/wallets/:id role ≠ 'service' → 401", {
      url: `${W}/internal/wallets/{{walletId}}`,
      headers: svc('{{serviceTokenWrongRole}}'),
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('GET /internal/wallets/:id unknown → 404', {
      url: `${W}/internal/wallets/${MISSING_OBJECT_ID}`,
      headers: svc(),
      tests: S.error(404, 'NOT_FOUND'),
    }),
    internalReq('GET /internal/wallets/:id invalid ObjectId → 400', {
      url: `${W}/internal/wallets/bad-id`,
      headers: svc(),
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    internalReq('POST debit 1000 sats', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc(),
      pre: randomObjectId('internalTxId'),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000' },
      tests: [
        S.status(200),
        S.schema('balance', balanceSchema),
        `pm.test('balance reduced by 1000', function () {
  const expected = parseInt(pm.collectionVariables.get('expectedBalance'), 10) - 1000;
  pm.expect(pm.response.json().balanceCache).to.eql(String(expected));
  pm.collectionVariables.set('expectedBalance', String(expected));
});`,
      ],
    }),
    internalReq('POST debit replay (same transactionId) → same balance', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000' },
      tests: [
        S.status(200),
        `pm.test('idempotent: not debited twice', function () { pm.expect(pm.response.json().balanceCache).to.eql(pm.collectionVariables.get('expectedBalance')); });`,
      ],
    }),
    internalReq('POST debit same transactionId, different amount → 409', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '2000' },
      tests: S.error(409, 'IDEMPOTENCY_CONFLICT'),
    }),
    internalReq('POST debit beyond balance → 409 INSUFFICIENT_FUNDS', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc(),
      pre: randomObjectId('internalBigTxId'),
      body: { transactionId: '{{internalBigTxId}}', amountSats: '9999999999' },
      tests: S.error(409, 'INSUFFICIENT_FUNDS'),
    }),
    internalReq('POST debit unknown wallet → 404', {
      method: 'POST',
      url: `${W}/internal/wallets/${MISSING_OBJECT_ID}/debits`,
      headers: svc(),
      pre: randomObjectId('internalGhostTxId'),
      body: { transactionId: '{{internalGhostTxId}}', amountSats: '1' },
      tests: S.error(404, 'NOT_FOUND'),
    }),
    internalReq('POST debit non-ObjectId transactionId → 400', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc(),
      body: { transactionId: 'tx-1', amountSats: '1' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    internalReq('POST debit without token → 401', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      body: { transactionId: '{{internalTxId}}', amountSats: '1000' },
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('POST debit wrong caller → 403', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/debits`,
      headers: svc('{{serviceTokenWrongCaller}}'),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000' },
      tests: S.error(403, 'FORBIDDEN'),
    }),
    internalReq('POST credit refund of the debit', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'refund' },
      tests: [
        S.status(200),
        S.schema('balance', balanceSchema),
        `pm.test('balance restored by 1000', function () {
  const expected = parseInt(pm.collectionVariables.get('expectedBalance'), 10) + 1000;
  pm.expect(pm.response.json().balanceCache).to.eql(String(expected));
  pm.collectionVariables.set('expectedBalance', String(expected));
});`,
      ],
    }),
    internalReq('POST credit refund replay → same balance', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'refund' },
      tests: [
        S.status(200),
        `pm.test('idempotent: not refunded twice', function () { pm.expect(pm.response.json().balanceCache).to.eql(pm.collectionVariables.get('expectedBalance')); });`,
      ],
    }),
    internalReq('POST credit refund without a debit → 409 REFUND_WITHOUT_DEBIT', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      pre: randomObjectId('internalNoDebitTxId'),
      body: { transactionId: '{{internalNoDebitTxId}}', amountSats: '1000', reason: 'refund' },
      tests: S.error(409, 'REFUND_WITHOUT_DEBIT'),
    }),
    internalReq('POST credit refund amount ≠ debit → 409 REFUND_WITHOUT_DEBIT', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '999', reason: 'refund' },
      tests: S.error(409, 'REFUND_WITHOUT_DEBIT'),
    }),
    internalReq('POST credit refund for another wallet → 409 REFUND_WITHOUT_DEBIT', {
      method: 'POST',
      url: `${W}/internal/wallets/{{bobWalletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'refund' },
      tests: S.error(409, 'REFUND_WITHOUT_DEBIT'),
    }),
    internalReq('POST credit missing reason → 400', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    internalReq('POST credit reason "deposit" → 400 (only refund)', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc(),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'deposit' },
      tests: S.error(400, 'VALIDATION_ERROR'),
    }),
    internalReq('POST credit without token → 401', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'refund' },
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    internalReq('POST credit wrong caller → 403', {
      method: 'POST',
      url: `${W}/internal/wallets/{{walletId}}/credits`,
      headers: svc('{{serviceTokenWrongCaller}}'),
      body: { transactionId: '{{internalTxId}}', amountSats: '1000', reason: 'refund' },
      tests: S.error(403, 'FORBIDDEN'),
    }),
    request('Balance matches the ledger after internal movements', {
      url: `${W}/api/v1/wallets/{{walletId}}/balance`,
      tests: [
        S.status(200),
        `pm.test('balance equals expectedBalance', function () { pm.expect(pm.response.json().balanceCache).to.eql(pm.collectionVariables.get('expectedBalance')); });`,
      ],
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 5 GraphQL
// ---------------------------------------------------------------------------------------------
const gql = (name, { query, variables, auth = 'owner', tests, pre, description }) =>
  request(name, { method: 'POST', url: `${GW}/graphql`, auth, graphql: { query, variables }, tests, pre, description });

const gqlFolder = folder(
  '5 GraphQL',
  'GraphQL gateway :3003 (mercurius) — every Query and Mutation, enum mapping (UPPER_SNAKE ⇄ lower-kebab), upstream error mapping to `extensions.code`, depth limit and introspection. Resolver errors return HTTP 200 with `errors[]`; document validation errors return 400. Requires folders 1-3.',
  [
    gql('Mutation createWallet (TESTNET, HOT, metadata)', {
      query: `mutation CreateWallet($input: CreateWalletInput!) {
  createWallet(input: $input) { ${WALLET_FIELDS} }
}`,
      variables: { input: { label: 'Postman GQL Hot', network: 'TESTNET', type: 'HOT', metadata: { via: 'graphql' } } },
      tests: [
        ...S.gqlOk('createWallet'),
        S.gqlSchema('createWallet', gqlWalletSchema),
        `pm.test('exactly the requested fields', function () { pm.expect(pm.response.json().data.createWallet).to.have.all.keys(${js(WALLET_FIELDS.split(' '))}); });`,
        `pm.test('enums are UPPER_SNAKE, owner from token', function () {
  const w = pm.response.json().data.createWallet;
  pm.expect(w.network).to.eql('TESTNET');
  pm.expect(w.type).to.eql('HOT');
  pm.expect(w.status).to.eql('ACTIVE');
  pm.expect(w.balanceCache).to.eql('0');
  pm.expect(w.metadata).to.eql({ via: 'graphql' });
  pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId'));
});
pm.collectionVariables.set('gqlWalletId', pm.response.json().data.createWallet.id);`,
      ],
    }),
    gql('Mutation createWallet (REGTEST, NON_CUSTODIAL) — enum mapping', {
      query: `mutation CreateRegtestWallet {
  createWallet(input: { label: "Postman GQL Regtest", network: REGTEST, type: NON_CUSTODIAL }) { id network type address metadata }
}`,
      tests: [
        ...S.gqlOk('createWallet'),
        `pm.test('NON_CUSTODIAL/REGTEST round-trip through non-custodial/regtest', function () {
  const w = pm.response.json().data.createWallet;
  pm.expect(w.network).to.eql('REGTEST');
  pm.expect(w.type).to.eql('NON_CUSTODIAL');
  pm.expect(w.address).to.match(/^bcrt1/);
  pm.expect(w.metadata).to.eql({});
});`,
      ],
    }),
    gql('Mutation createWallet (MAINNET, COLD)', {
      query: `mutation CreateMainnetWallet {
  createWallet(input: { label: "Postman GQL Cold", network: MAINNET, type: COLD }) { id network type address status }
}`,
      tests: [
        ...S.gqlOk('createWallet'),
        `pm.test('MAINNET/COLD with bc1 address', function () {
  const w = pm.response.json().data.createWallet;
  pm.expect(w.network).to.eql('MAINNET');
  pm.expect(w.type).to.eql('COLD');
  pm.expect(w.address).to.match(/^bc1/);
});`,
      ],
    }),
    gql('Mutation createWallet: invalid enum value → 400', {
      query: `mutation BadEnum {
  createWallet(input: { label: "x", network: SIGNET, type: HOT }) { id }
}`,
      tests: S.gqlValidation('/SIGNET|Network/'),
    }),
    gql('Mutation createWallet: empty label → VALIDATION_ERROR (upstream 400)', {
      query: `mutation EmptyLabel {
  createWallet(input: { label: "", network: TESTNET, type: HOT }) { id }
}`,
      tests: S.gqlError('VALIDATION_ERROR'),
    }),
    gql('Mutation createWallet: no token → UNAUTHORIZED', {
      auth: 'none',
      query: `mutation Anon {
  createWallet(input: { label: "anon", network: TESTNET, type: HOT }) { id }
}`,
      tests: S.gqlError('UNAUTHORIZED'),
    }),
    gql('Query wallet(id)', {
      query: `query Wallet($id: ID!) {
  wallet(id: $id) { ${WALLET_FIELDS} }
}`,
      variables: { id: '{{walletId}}' },
      tests: [
        ...S.gqlOk('wallet'),
        S.gqlSchema('wallet', gqlWalletSchema),
        `pm.test('REST wallet visible through the gateway', function () {
  const w = pm.response.json().data.wallet;
  pm.expect(w.id).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(w.network).to.eql('TESTNET');
  pm.expect(w.balanceCache).to.eql(pm.collectionVariables.get('expectedBalance'));
});`,
      ],
    }),
    gql("Query wallet(id): other user's wallet → null + NOT_FOUND", {
      auth: 'other',
      query: `query OtherWallet($id: ID!) {
  wallet(id: $id) { id }
}`,
      variables: { id: '{{walletId}}' },
      tests: [
        ...S.gqlError('NOT_FOUND'),
        `pm.test('nullable field resolves to null', function () { pm.expect(pm.response.json().data.wallet).to.be.null; });`,
      ],
    }),
    gql('Query wallet(id): invalid id → VALIDATION_ERROR', {
      query: `query BadId {
  wallet(id: "not-an-id") { id }
}`,
      tests: S.gqlError('VALIDATION_ERROR'),
    }),
    gql('Query wallet(id): bad signature token → UNAUTHORIZED', {
      auth: '{{badSignatureToken}}',
      query: `query Forged($id: ID!) {
  wallet(id: $id) { id }
}`,
      variables: { id: '{{walletId}}' },
      tests: S.gqlError('UNAUTHORIZED'),
    }),
    gql('Query wallets(page, limit)', {
      query: `query Wallets {
  wallets(page: 1, limit: 2) { items { ${WALLET_FIELDS} } pageInfo { total page limit totalPages } }
}`,
      tests: [
        ...S.gqlOk('wallets'),
        S.gqlSchema('wallets', gqlConnection(gqlWalletSchema)),
        `pm.test('connection shape + pagination', function () {
  const c = pm.response.json().data.wallets;
  pm.expect(c.pageInfo.page).to.eql(1);
  pm.expect(c.pageInfo.limit).to.eql(2);
  pm.expect(c.items.length).to.be.at.most(2);
  pm.expect(c.pageInfo.total).to.be.at.least(4);
  c.items.forEach(function (w) { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('ownerUserId')); });
});`,
      ],
    }),
    gql('Query wallets(ownerUserId) as admin', {
      auth: 'admin',
      query: `query WalletsByOwner($owner: String) {
  wallets(ownerUserId: $owner, limit: 100) { items { id ownerUserId } pageInfo { total } }
}`,
      variables: { owner: '{{otherUserId}}' },
      tests: [
        ...S.gqlOk('wallets'),
        `pm.test('only wallets owned by bob, includes bobWalletId', function () {
  const items = pm.response.json().data.wallets.items;
  items.forEach(function (w) { pm.expect(w.ownerUserId).to.eql(pm.collectionVariables.get('otherUserId')); });
  pm.expect(items.map(function (w) { return w.id; })).to.include(pm.collectionVariables.get('bobWalletId'));
});`,
      ],
    }),
    gql('Query wallets: limit 101 → VALIDATION_ERROR', {
      query: `query TooMany {
  wallets(limit: 101) { pageInfo { total } }
}`,
      tests: [
        ...S.gqlError('VALIDATION_ERROR'),
        `pm.test('non-nullable root → data null', function () { pm.expect(pm.response.json().data).to.be.null; });`,
      ],
    }),
    gql('Mutation updateWalletMetadata', {
      query: `mutation Update($id: ID!, $input: UpdateWalletMetadataInput!) {
  updateWalletMetadata(id: $id, input: $input) { id label metadata updatedAt }
}`,
      variables: { id: '{{gqlWalletId}}', input: { label: 'Postman GQL Hot (renamed)', metadata: { via: 'graphql', updated: true } } },
      tests: [
        ...S.gqlOk('updateWalletMetadata'),
        `pm.test('label + metadata updated', function () {
  const w = pm.response.json().data.updateWalletMetadata;
  pm.expect(w.id).to.eql(pm.collectionVariables.get('gqlWalletId'));
  pm.expect(w.label).to.eql('Postman GQL Hot (renamed)');
  pm.expect(w.metadata).to.eql({ via: 'graphql', updated: true });
});`,
      ],
    }),
    gql('Mutation updateWalletMetadata: other user → NOT_FOUND', {
      auth: 'other',
      query: `mutation Hijack($id: ID!) {
  updateWalletMetadata(id: $id, input: { label: "hijack" }) { id }
}`,
      variables: { id: '{{gqlWalletId}}' },
      tests: S.gqlError('NOT_FOUND'),
    }),
    gql('Mutation updateWalletMetadata: auditor → FORBIDDEN', {
      auth: 'auditor',
      query: `mutation AuditorWrite($id: ID!) {
  updateWalletMetadata(id: $id, input: { label: "audit" }) { id }
}`,
      variables: { id: '{{gqlWalletId}}' },
      tests: S.gqlError('FORBIDDEN'),
    }),
    gql('Mutation createTransaction (idempotencyKey)', {
      pre: guid('gqlIdemKey'),
      query: `mutation Send($input: CreateTransactionInput!) {
  createTransaction(input: $input) { ${TX_FIELDS} }
}`,
      variables: {
        input: { walletId: '{{walletId}}', amount: '5000', feeRate: '1', destinationAddress: VALID_TESTNET_ADDRESS, idempotencyKey: '{{gqlIdemKey}}' },
      },
      tests: [
        ...S.gqlOk('createTransaction'),
        S.gqlSchema('createTransaction', gqlTxSchema),
        `pm.test('PENDING SEND, string sats', function () {
  const t = pm.response.json().data.createTransaction;
  pm.expect(t.type).to.eql('SEND');
  pm.expect(t.status).to.eql('PENDING');
  pm.expect(t.amount).to.eql('5000');
  pm.expect(t.feeRate).to.eql('1');
  pm.expect(t.walletId).to.eql(pm.collectionVariables.get('walletId'));
  pm.expect(t).to.not.have.property('rawTx');
});
pm.collectionVariables.set('gqlTxId', pm.response.json().data.createTransaction.id);`,
      ],
    }),
    gql('Mutation createTransaction replay (same idempotencyKey) → same id', {
      query: `mutation SendReplay($input: CreateTransactionInput!) {
  createTransaction(input: $input) { id status }
}`,
      variables: {
        input: { walletId: '{{walletId}}', amount: '5000', feeRate: '1', destinationAddress: VALID_TESTNET_ADDRESS, idempotencyKey: '{{gqlIdemKey}}' },
      },
      tests: [
        ...S.gqlOk('createTransaction'),
        `pm.test('original transaction returned', function () { pm.expect(pm.response.json().data.createTransaction.id).to.eql(pm.collectionVariables.get('gqlTxId')); });`,
      ],
    }),
    gql('Mutation createTransaction same key, different amount → IDEMPOTENCY_CONFLICT', {
      query: `mutation SendConflict($input: CreateTransactionInput!) {
  createTransaction(input: $input) { id }
}`,
      variables: {
        input: { walletId: '{{walletId}}', amount: '5001', feeRate: '1', destinationAddress: VALID_TESTNET_ADDRESS, idempotencyKey: '{{gqlIdemKey}}' },
      },
      tests: S.gqlError('IDEMPOTENCY_CONFLICT'),
    }),
    gql('Mutation createTransaction: bad idempotencyKey → BAD_USER_INPUT', {
      query: `mutation BadKey {
  createTransaction(input: { walletId: "{{walletId}}", amount: "1000", feeRate: "1", destinationAddress: "${VALID_TESTNET_ADDRESS}", idempotencyKey: "bad key!" }) { id }
}`,
      tests: S.gqlError('BAD_USER_INPUT'),
    }),
    gql('Mutation createTransaction: non-integer amount → BAD_USER_INPUT', {
      pre: guid('gqlBadAmountKey'),
      query: `mutation BadAmount($key: String!) {
  createTransaction(input: { walletId: "{{walletId}}", amount: "0.5", feeRate: "1", destinationAddress: "${VALID_TESTNET_ADDRESS}", idempotencyKey: $key }) { id }
}`,
      variables: { key: '{{gqlBadAmountKey}}' },
      tests: S.gqlError('BAD_USER_INPUT'),
    }),
    gql('Mutation createTransaction: wrong-network address → VALIDATION_ERROR', {
      pre: guid('gqlBadAddrKey'),
      query: `mutation BadAddress($key: String!) {
  createTransaction(input: { walletId: "{{walletId}}", amount: "1000", feeRate: "1", destinationAddress: "${MAINNET_ADDRESS}", idempotencyKey: $key }) { id }
}`,
      variables: { key: '{{gqlBadAddrKey}}' },
      tests: S.gqlError('VALIDATION_ERROR'),
    }),
    gql('Mutation createTransaction: unfunded wallet → INSUFFICIENT_FUNDS', {
      pre: guid('gqlPoorKey'),
      query: `mutation Unfunded($key: String!) {
  createTransaction(input: { walletId: "{{gqlWalletId}}", amount: "1000", feeRate: "1", destinationAddress: "${VALID_TESTNET_ADDRESS}", idempotencyKey: $key }) { id }
}`,
      variables: { key: '{{gqlPoorKey}}' },
      tests: S.gqlError('INSUFFICIENT_FUNDS'),
    }),
    gql("Mutation createTransaction: other user's wallet → FORBIDDEN", {
      auth: 'other',
      pre: guid('gqlForbiddenKey'),
      query: `mutation NotMine($key: String!) {
  createTransaction(input: { walletId: "{{walletId}}", amount: "1000", feeRate: "1", destinationAddress: "${VALID_TESTNET_ADDRESS}", idempotencyKey: $key }) { id }
}`,
      variables: { key: '{{gqlForbiddenKey}}' },
      tests: S.gqlError('FORBIDDEN'),
    }),
    gql('Query transaction(id)', {
      query: `query Tx($id: ID!) {
  transaction(id: $id) { ${TX_FIELDS} }
}`,
      variables: { id: '{{transactionId}}' },
      tests: [
        ...S.gqlOk('transaction'),
        S.gqlSchema('transaction', gqlTxSchema),
        `pm.test('REST-created send visible as BROADCAST/CONFIRMED', function () {
  const t = pm.response.json().data.transaction;
  pm.expect(t.id).to.eql(pm.collectionVariables.get('transactionId'));
  pm.expect(['BROADCAST', 'CONFIRMED']).to.include(t.status);
  pm.expect(t.txid).to.eql(pm.collectionVariables.get('txid'));
});`,
      ],
    }),
    gql('Query transaction(id): other user → null + NOT_FOUND', {
      auth: 'other',
      query: `query OtherTx($id: ID!) {
  transaction(id: $id) { id }
}`,
      variables: { id: '{{transactionId}}' },
      tests: [
        ...S.gqlError('NOT_FOUND'),
        `pm.test('nullable field resolves to null', function () { pm.expect(pm.response.json().data.transaction).to.be.null; });`,
      ],
    }),
    gql('Query transactions(walletId, status: PENDING, from)', {
      pre: `pm.collectionVariables.set('gqlFrom', new Date(Date.now() - 3600 * 1000).toISOString());`,
      query: `query PendingTxs($walletId: String, $from: String) {
  transactions(walletId: $walletId, status: PENDING, from: $from, page: 1, limit: 50) {
    items { ${TX_FIELDS} }
    pageInfo { total page limit totalPages }
  }
}`,
      variables: { walletId: '{{walletId}}', from: '{{gqlFrom}}' },
      tests: [
        ...S.gqlOk('transactions'),
        S.gqlSchema('transactions', gqlConnection(gqlTxSchema)),
        `pm.test('pending list contains the GraphQL send only', function () {
  const c = pm.response.json().data.transactions;
  c.items.forEach(function (t) { pm.expect(t.status).to.eql('PENDING'); });
  pm.expect(c.items.map(function (t) { return t.id; })).to.include(pm.collectionVariables.get('gqlTxId'));
  pm.expect(c.items.map(function (t) { return t.id; })).to.not.include(pm.collectionVariables.get('transactionId'));
});`,
      ],
    }),
    gql('Query transactions(status: FAILED, to) — enum filter', {
      query: `query FailedTxs($walletId: String) {
  transactions(walletId: $walletId, status: FAILED, to: "2999-01-01T00:00:00.000Z") { items { id status amount } pageInfo { total } }
}`,
      variables: { walletId: '{{walletId}}' },
      tests: [
        ...S.gqlOk('transactions'),
        `pm.test('the insufficient-funds send is FAILED', function () {
  const items = pm.response.json().data.transactions.items;
  pm.expect(items.length).to.be.at.least(1);
  items.forEach(function (t) { pm.expect(t.status).to.eql('FAILED'); });
  pm.expect(items.map(function (t) { return t.amount; })).to.include('99999999');
});`,
      ],
    }),
    gql('Query transactions(status: BROADCAST|CONFIRMED) via aliases', {
      query: `query Sent($walletId: String) {
  broadcast: transactions(walletId: $walletId, status: BROADCAST) { items { id } }
  confirmed: transactions(walletId: $walletId, status: CONFIRMED) { items { id } }
}`,
      variables: { walletId: '{{walletId}}' },
      tests: [
        S.status(200),
        `pm.test('REST send appears under BROADCAST or CONFIRMED', function () {
  const d = pm.response.json().data;
  const ids = d.broadcast.items.concat(d.confirmed.items).map(function (t) { return t.id; });
  pm.expect(ids).to.include(pm.collectionVariables.get('transactionId'));
});`,
      ],
    }),
    gql('Query transactions: invalid status enum → 400', {
      query: `query BadStatus {
  transactions(status: SETTLED) { pageInfo { total } }
}`,
      tests: S.gqlValidation('/SETTLED|TransactionStatus/'),
    }),
    gql('Query depth limit exceeded → 400', {
      description: 'GRAPHQL_QUERY_DEPTH (default 8). The schema has no cycles, so depth is exceeded with nested introspection; with introspection disabled the request is rejected by NoSchemaIntrospectionCustomRule instead — still 400.',
      query: `query TooDeep {
  __schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } }
}`,
      tests: S.gqlValidation('/depth|introspection/i'),
    }),
    gql('Introspection behaviour', {
      auth: 'none',
      description: 'expectIntrospection=true (dev compose sets GRAPHQL_INTROSPECTION_ENABLED=true) → 200; false (production default) → 400.',
      query: `query Introspect {
  __schema { queryType { name } mutationType { name } }
}`,
      tests: `const expectIntrospection = (pm.variables.get('expectIntrospection') || 'true') === 'true';
pm.test('introspection ' + (expectIntrospection ? 'enabled (200)' : 'disabled (400)'), function () {
  pm.response.to.have.status(expectIntrospection ? 200 : 400);
});
if (expectIntrospection) {
  pm.test('schema root types', function () {
    const s = pm.response.json().data.__schema;
    pm.expect(s.queryType.name).to.eql('Query');
    pm.expect(s.mutationType.name).to.eql('Mutation');
  });
} else {
  pm.test('rejected by validation', function () { pm.expect(pm.response.json().errors[0].message).to.match(/introspection/i); });
}`,
    }),
    gql('Malformed GraphQL document → 400', {
      description: 'Syntax errors are rejected before execution with HTTP 400.',
      query: `mutation Broken {
  createWallet(input: { label: "x" network: TESTNET type: HOT }
}`,
      tests: S.gqlValidation('/Syntax|Expected/i'),
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// 6 Security checks
// ---------------------------------------------------------------------------------------------
const headerChecks = (label) => [
  `pm.test('${label}: helmet security headers', function () {
  const h = pm.response.headers;
  pm.expect(h.get('X-Content-Type-Options')).to.eql('nosniff');
  pm.expect(h.get('X-Frame-Options')).to.match(/SAMEORIGIN|DENY/);
  pm.expect(h.get('Strict-Transport-Security')).to.match(/max-age=\\d+/);
  pm.expect(h.get('Referrer-Policy')).to.be.a('string');
  pm.expect(h.get('Cross-Origin-Opener-Policy')).to.be.a('string');
  pm.expect(h.has('X-Powered-By')).to.be.false;
});`,
  `if ((pm.variables.get('expectCsp') || 'false') === 'true') {
  pm.test('${label}: Content-Security-Policy present', function () { pm.expect(pm.response.headers.get('Content-Security-Policy')).to.include("default-src 'self'"); });
} else {
  pm.test.skip('${label}: CSP relaxed while Swagger UI/GraphiQL are served (set expectCsp=true for production-like stacks)', function () {});
}`,
];

const securityFolder = folder(
  '6 Security checks',
  'CORS allow-list, helmet headers, rate-limit headers, body limit (413), content-type handling and user-JWT rejection cases. Standalone except the authenticated checks (needs only tokens).',
  [
    request('Gateway CORS preflight, allowed origin → 204 + ACAO', {
      method: 'OPTIONS',
      url: `${GW}/graphql`,
      auth: 'none',
      headers: { Origin: '{{webOrigin}}', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
      tests: [
        S.status(204),
        `pm.test('origin echoed, methods + headers allowed, not wildcard', function () {
  const h = pm.response.headers;
  pm.expect(h.get('Access-Control-Allow-Origin')).to.eql(pm.variables.get('webOrigin'));
  pm.expect(h.get('Access-Control-Allow-Methods')).to.include('POST');
  pm.expect(h.get('Access-Control-Allow-Headers').toLowerCase()).to.include('authorization');
  pm.expect(h.get('Access-Control-Allow-Headers').toLowerCase()).to.include('idempotency-key');
  pm.expect(h.get('Access-Control-Max-Age')).to.eql('600');
});`,
      ],
    }),
    request('Gateway CORS preflight, disallowed origin → no ACAO', {
      method: 'OPTIONS',
      url: `${GW}/graphql`,
      auth: 'none',
      headers: { Origin: '{{disallowedOrigin}}', 'Access-Control-Request-Method': 'POST' },
      tests: [S.statusOneOf([204, 404]), S.noAcao()],
    }),
    request('Gateway simple request with allowed Origin → ACAO echoed', {
      url: `${GW}/healthz`,
      auth: 'none',
      headers: { Origin: '{{webOrigin}}' },
      tests: [
        S.status(200),
        `pm.test('ACAO echoes the allowed origin, Vary: Origin', function () {
  pm.expect(pm.response.headers.get('Access-Control-Allow-Origin')).to.eql(pm.variables.get('webOrigin'));
  pm.expect(pm.response.headers.get('Vary') || '').to.match(/Origin/i);
});`,
      ],
    }),
    request('wallet-service CORS preflight → no ACAO (no browser origins configured)', {
      method: 'OPTIONS',
      url: `${W}/api/v1/wallets`,
      auth: 'none',
      headers: { Origin: '{{webOrigin}}', 'Access-Control-Request-Method': 'POST' },
      description: 'REST services ship with CORS_ALLOWED_ORIGINS empty: only the gateway is browser-facing.',
      tests: [S.statusOneOf([204, 404]), S.noAcao()],
    }),
    request('transaction-service CORS preflight → no ACAO', {
      method: 'OPTIONS',
      url: `${TX}/api/v1/transactions`,
      auth: 'none',
      headers: { Origin: '{{webOrigin}}', 'Access-Control-Request-Method': 'POST' },
      tests: [S.statusOneOf([204, 404]), S.noAcao()],
    }),
    request('wallet-service security headers + rate-limit headers', {
      url: `${W}/api/v1/wallets?limit=1`,
      tests: [
        S.status(200),
        ...headerChecks('wallet-service'),
        `pm.test('rate-limit headers (keyed by JWT sub)', function () {
  const h = pm.response.headers;
  pm.expect(parseInt(h.get('x-ratelimit-limit'), 10)).to.be.above(0);
  pm.expect(parseInt(h.get('x-ratelimit-remaining'), 10)).to.be.at.least(0);
  pm.expect(parseInt(h.get('x-ratelimit-reset'), 10)).to.be.at.least(0);
});`,
      ],
    }),
    request('transaction-service security headers + rate-limit headers', {
      url: `${TX}/api/v1/transactions?limit=1`,
      tests: [
        S.status(200),
        ...headerChecks('transaction-service'),
        `pm.test('rate-limit headers present', function () { pm.expect(pm.response.headers.has('x-ratelimit-limit')).to.be.true; pm.expect(pm.response.headers.has('x-ratelimit-remaining')).to.be.true; });`,
      ],
    }),
    request('Gateway security headers + rate-limit headers', {
      method: 'POST',
      url: `${GW}/graphql`,
      graphql: { query: '{ __typename }' },
      tests: [
        S.status(200),
        ...headerChecks('graphql-gateway'),
        `pm.test('rate-limit headers present', function () { pm.expect(pm.response.headers.has('x-ratelimit-limit')).to.be.true; });
pm.test('__typename is Query', function () { pm.expect(pm.response.json().data.__typename).to.eql('Query'); });`,
      ],
    }),
    request('wallet-service oversized body → 413', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      pre: `const limit = parseInt(pm.variables.get('bodyLimitBytes') || '65536', 10);
pm.collectionVariables.set('oversizedPad', new Array(limit + 2048).join('x'));`,
      body: '{"label":"{{oversizedPad}}","network":"testnet","type":"hot"}',
      headers: { 'Content-Type': 'application/json' },
      tests: S.error(413, 'PAYLOAD_TOO_LARGE'),
    }),
    request('transaction-service oversized body → 413', {
      method: 'POST',
      url: `${TX}/api/v1/transactions`,
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '{{$guid}}' },
      body: '{"walletId":"{{walletId}}","type":"send","amount":"1","feeRate":"1","destinationAddress":"{{oversizedPad}}"}',
      tests: S.error(413, 'PAYLOAD_TOO_LARGE'),
    }),
    request('Gateway oversized body → 413', {
      method: 'POST',
      url: `${GW}/graphql`,
      headers: { 'Content-Type': 'application/json' },
      body: '{"query":"{ __typename }","variables":{"pad":"{{oversizedPad}}"}}',
      tests: [
        S.status(413),
        `pm.test('oversized payload is not processed', function () { pm.expect(pm.response.text()).to.not.include('__typename\\":\\"Query'); });`,
      ],
    }),
    request('Malformed JSON → 400', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      headers: { 'Content-Type': 'application/json' },
      body: '{"label": "broken", ',
      tests: S.error(400, 'BAD_REQUEST'),
    }),
    request('Unsupported Content-Type → 415', {
      method: 'POST',
      url: `${W}/api/v1/wallets`,
      headers: { 'Content-Type': 'application/xml' },
      description: 'Only JSON (and text/plain, which Fastify parses natively) have content-type parsers; anything else is 415.',
      body: '<wallet><label>xml</label></wallet>',
      tests: S.error(415, 'UNSUPPORTED_MEDIA_TYPE'),
    }),
    request('JWT with bad signature → 401', {
      url: `${W}/api/v1/wallets`,
      auth: '{{badSignatureToken}}',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('JWT alg "none" → 401', {
      url: `${W}/api/v1/wallets`,
      auth: '{{algNoneToken}}',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Expired JWT → 401', {
      url: `${TX}/api/v1/transactions`,
      auth: '{{expiredToken}}',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('JWT with wrong issuer → 401', {
      url: `${TX}/api/v1/transactions`,
      auth: '{{wrongIssuerToken}}',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('JWT without sub → 401', {
      url: `${W}/api/v1/wallets`,
      auth: '{{noSubToken}}',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Service token is not a user token → 401', {
      url: `${W}/api/v1/wallets`,
      auth: '{{serviceToken}}',
      description: 'Different secret (INTERNAL_JWT_SECRET) and issuer: a service token can never authenticate a user route.',
      tests: S.error(401, 'UNAUTHORIZED'),
    }),
    request('Error responses never leak internals (unknown route → 404)', {
      url: `${W}/api/v1/does-not-exist`,
      tests: [
        S.status(404),
        `pm.test('no stack trace / framework detail', function () {
  const text = pm.response.text();
  pm.expect(text).to.not.match(/node_modules|at [A-Za-z]+ \\(|\\.ts:\\d+/);
});`,
      ],
    }),
  ],
);

// ---------------------------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------------------------
const collectionVariableKeys = [
  'ownerToken', 'otherUserToken', 'adminToken', 'auditorToken',
  'ownerUserId', 'otherUserId', 'adminUserId', 'auditorUserId',
  'ownerTokenMode', 'otherUserTokenMode', 'adminTokenMode', 'auditorTokenMode',
  'ownerTokenExp', 'otherUserTokenExp', 'adminTokenExp', 'auditorTokenExp',
  'serviceToken', 'serviceTokenWrongCaller', 'serviceTokenWrongAudience', 'serviceTokenExpired', 'serviceTokenWrongRole',
  'userTokenAsServiceToken', 'badSignatureToken', 'expiredToken', 'wrongIssuerToken', 'noSubToken', 'algNoneToken',
  'runId', 'walletId', 'walletAddress', 'bobWalletId', 'bobWalletAddress', 'expectedBalance',
  'depositRef', 'ghostDepositRef',
  'txIdemKey', 'txAmount', 'txFeeRate', 'txFeeSats', 'txFrom', 'transactionId', 'txid', 'failedTxKey',
  'internalTxId', 'internalBigTxId', 'internalGhostTxId', 'internalNoDebitTxId',
  'gqlWalletId', 'gqlIdemKey', 'gqlTxId', 'gqlFrom', 'gqlBadAmountKey', 'gqlBadAddrKey', 'gqlPoorKey', 'gqlForbiddenKey',
  'oversizedPad',
];

const collection = {
  info: {
    _postman_id: '7d0c3f5e-2a4b-4c1d-9e8f-5a6b7c8d9e0f',
    name: 'zuma API (end-to-end)',
    description:
      'Every zuma API: wallet-service :3001, transaction-service :3002 (REST + /internal service routes + admin), graphql-gateway :3003 (every Query/Mutation), health/readiness/metrics/docs and security checks.\n\n' +
      'Run the whole collection in order: it creates its own data and chains ids through collection variables. ' +
      'Tokens are minted by the collection pre-request script (authMode=hs256 needs jwtSecret; authMode=oidc fetches from oidcTokenUrl). ' +
      'Service tokens for /internal/* need internalJwtSecret. See docs/postman/README.md.\n\n' +
      'GENERATED by docs/postman/build-collection.mjs — edit that file, not this JSON.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'noauth' },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: collectionPreRequest.split('\n') } },
    { listen: 'test', script: { type: 'text/javascript', exec: collectionTest.split('\n') } },
  ],
  variable: collectionVariableKeys.map((key) => ({ key, value: '', type: 'string' })),
  item: [healthFolder, walletsFolder, adminFolder, txFolder, internalFolder, gqlFolder, securityFolder],
};

const out = join(here, 'zuma.postman_collection.json');
writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0);
console.log(`wrote ${out} (${count(collection.item)} requests)`);

// ---------------------------------------------------------------------------------------------
// Environments. Secrets ship EMPTY; scripts/run-postman.sh injects them at run time.
// ---------------------------------------------------------------------------------------------
const envValue = (key, value, type = 'default') => ({ key, value, type, enabled: true });
const commonEnv = [
  envValue('walletUrl', 'http://localhost:3001'),
  envValue('transactionUrl', 'http://localhost:3002'),
  envValue('gatewayUrl', 'http://localhost:3003'),
  envValue('disallowedOrigin', 'https://evil.example'),
  envValue('jwtSecret', '', 'secret'),
  envValue('jwtTtlSeconds', '300'),
  envValue('internalJwtSecret', '', 'secret'),
  envValue('internalJwtIssuer', 'zuma-internal'),
  envValue('metricsToken', '', 'secret'),
  envValue('oidcClientId', 'zuma-postman'),
  envValue('oidcClientSecret', 'mock-not-a-secret'),
  envValue('ownerOidcScope', 'zuma-user'),
  envValue('otherUserOidcScope', 'zuma-user-2'),
  envValue('adminOidcScope', 'zuma-admin'),
  envValue('auditorOidcScope', 'zuma-auditor'),
  envValue('ownerSub', 'user-alice'),
  envValue('otherUserSub', 'user-bob'),
  envValue('adminSub', 'user-admin'),
  envValue('auditorSub', 'user-auditor'),
  envValue('expectDocs', 'true'),
  envValue('expectIntrospection', 'true'),
  envValue('expectCsp', 'false'),
  envValue('mockBitcoinNode', 'true'),
  envValue('bodyLimitBytes', '65536'),
  envValue('maxResponseMs', '5000'),
];
const environments = [
  {
    file: 'zuma-local.postman_environment.json',
    id: '6f1a0a1b-2c3d-4e5f-9a7b-8c9d0e1f2a3b',
    name: 'zuma-local (zhios stack, OIDC/JWKS)',
    // Root docker-compose.yml + deploy/compose/zuma.override.yml (and the Terraform docker path):
    // services verify RS256 tokens from mock-oidc; issuer http://localhost:8090/zuma, audience zuma-api.
    values: [
      envValue('authMode', 'oidc'),
      envValue('oidcTokenUrl', 'http://localhost:8090/zuma/token'),
      envValue('oidcHostHeader', ''),
      envValue('jwtIssuer', 'http://localhost:8090/zuma'),
      envValue('jwtAudience', 'zuma-api'),
      envValue('webOrigin', 'http://localhost:8080'),
    ],
  },
  {
    file: 'zuma-standalone-hs256.postman_environment.json',
    id: '0b6c2f4e-8d1a-4e7b-9c3f-1a2b3c4d5e6f',
    name: 'zuma-standalone (zuma/docker-compose.yml, HS256)',
    // zuma/docker-compose.yml on its own (or npm run dev): HS256 with JWT_SECRET, issuer zuma, no audience.
    values: [
      envValue('authMode', 'hs256'),
      envValue('oidcTokenUrl', 'http://localhost:8090/zuma/token'),
      envValue('oidcHostHeader', ''),
      envValue('jwtIssuer', 'zuma'),
      envValue('jwtAudience', ''),
      envValue('webOrigin', 'http://localhost:5173'),
    ],
  },
];
for (const e of environments) {
  const env = { id: e.id, name: e.name, values: [...e.values, ...commonEnv], _postman_variable_scope: 'environment' };
  writeFileSync(join(here, e.file), `${JSON.stringify(env, null, 2)}\n`);
  console.log(`wrote ${join(here, e.file)}`);
}
