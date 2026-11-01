// Run: node --test deploy/mock-oidc/server.test.mjs   (Node 22, no dependencies besides zuma's fast-jwt)
// Drives the real handler with in-memory req/res objects, then verifies issued tokens exactly the way
// zuma's auth plugin does (fast-jwt: RS256, allowedIss, allowedAud, requiredClaims).
import assert from 'node:assert/strict';
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createProvider, loadSettings } from './server.mjs';

const require = createRequire(new URL('../../zuma/package.json', import.meta.url));
const { createVerifier } = require('fast-jwt');

const ISSUER = 'http://localhost:8090/zuma';
const SPA = 'gnee-web-spa';
const REDIRECT = 'http://localhost:8080/callback';

const settings = loadSettings({
  ISSUER,
  CONFIG_PATH: new URL('./config.json', import.meta.url).pathname,
  ALLOWED_REDIRECT_URIS: REDIRECT,
  ALLOWED_POST_LOGOUT_REDIRECT_URIS: 'http://localhost:8080',
  ALLOWED_ORIGINS: 'http://localhost:8080',
});
const handle = createProvider(settings);

async function call(method, url, { form, headers = {} } = {}) {
  const body = form ? new URLSearchParams(form).toString() : '';
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { method, url, headers: { host: 'mock-oidc:8080', ...headers } });
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk = '') {
      this.body = String(chunk);
    },
  };
  await handle(req, res);
  const json = res.headers['content-type']?.startsWith('application/json') ? JSON.parse(res.body) : undefined;
  return { status: res.statusCode, headers: res.headers, body: res.body, json };
}

async function zumaVerifier() {
  const { json } = await call('GET', '/zuma/jwks');
  const key = createPublicKey({ key: json.keys[0], format: 'jwk' }).export({ type: 'spki', format: 'pem' });
  // Mirrors zuma/shared/http/src/auth.ts (JWKS path).
  return createVerifier({
    key,
    algorithms: ['RS256'],
    allowedIss: ISSUER,
    allowedAud: 'zuma-api',
    requiredClaims: ['sub', 'exp', 'iss', 'aud'],
  });
}

const decodeHeader = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString());

test('discovery: fixed issuer regardless of Host, endpoints under the issuer', async () => {
  const { status, json, headers } = await call('GET', '/zuma/.well-known/openid-configuration', {
    headers: { origin: 'http://localhost:8080', host: 'whatever:1234' },
  });
  assert.equal(status, 200);
  assert.equal(json.issuer, ISSUER);
  assert.equal(json.token_endpoint, `${ISSUER}/token`);
  assert.equal(json.jwks_uri, `${ISSUER}/jwks`);
  assert.deepEqual(json.code_challenge_methods_supported, ['S256']);
  assert.equal(headers['access-control-allow-origin'], 'http://localhost:8080');
});

test('CORS: disallowed origin gets no allow-origin header', async () => {
  const { headers } = await call('GET', '/zuma/jwks', { headers: { origin: 'http://evil.example' } });
  assert.equal(headers['access-control-allow-origin'], undefined);
});

test('jwks: RS256 signing key whose kid matches issued tokens', async () => {
  const { json } = await call('GET', '/zuma/jwks');
  assert.equal(json.keys.length, 1);
  assert.equal(json.keys[0].alg, 'RS256');
  assert.equal(json.keys[0].use, 'sig');
  assert.equal(json.keys[0].d, undefined, 'private key material must never be published');
  const token = await call('POST', '/zuma/token', { form: { grant_type: 'client_credentials', client_id: 'x', scope: 'zuma-user' } });
  assert.equal(decodeHeader(token.json.access_token).kid, json.keys[0].kid);
});

const personas = [
  ['zuma-user', 'postman-user', ['user']],
  ['zuma-user-2', 'postman-user-2', ['user']],
  ['zuma-admin', 'postman-admin', ['admin']],
  ['zuma-auditor', 'postman-auditor', ['auditor']],
];
for (const [scope, sub, roles] of personas) {
  test(`client_credentials scope=${scope} -> sub=${sub}, accepted by zuma's verifier`, async () => {
    const { status, json } = await call('POST', '/zuma/token', {
      form: { grant_type: 'client_credentials', client_id: 'smoke-test', client_secret: 'x', scope },
    });
    assert.equal(status, 200);
    const claims = (await zumaVerifier())(json.access_token);
    assert.equal(claims.sub, sub);
    assert.deepEqual(claims.roles, roles);
    assert.deepEqual(claims.aud, ['zuma-api']);
    assert.equal(claims.iss, ISSUER);
  });
}

test('client_credentials: Basic client auth and multi-scope requests work', async () => {
  const { status, json } = await call('POST', '/zuma/token', {
    form: { grant_type: 'client_credentials', scope: 'openid zuma-admin' },
    headers: { authorization: `Basic ${Buffer.from('zuma-postman:secret').toString('base64')}` },
  });
  assert.equal(status, 200);
  const claims = (await zumaVerifier())(json.access_token);
  assert.equal(claims.sub, 'postman-admin');
  assert.equal(claims.client_id, 'zuma-postman');
});

test('client_credentials: unknown scope is rejected (no silent default persona)', async () => {
  const { status, json } = await call('POST', '/zuma/token', {
    form: { grant_type: 'client_credentials', client_id: 'x', scope: 'zuma-nope' },
  });
  assert.equal(status, 400);
  assert.equal(json.error, 'invalid_scope');
});

test('unsupported grant type', async () => {
  const { status, json } = await call('POST', '/zuma/token', { form: { grant_type: 'password' } });
  assert.equal(status, 400);
  assert.equal(json.error, 'unsupported_grant_type');
});

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function login({ role = 'user', username = 'alice', challenge, nonce = 'n-1', state = 's-1' }) {
  const params = {
    response_type: 'code',
    client_id: SPA,
    redirect_uri: REDIRECT,
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  };
  const page = await call('GET', `/zuma/authorize?${new URLSearchParams(params)}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /<form method="post"/);
  const submit = await call('POST', '/zuma/authorize', { form: { ...params, username, role } });
  assert.equal(submit.status, 302);
  const location = new URL(submit.headers.location);
  assert.equal(`${location.origin}${location.pathname}`, REDIRECT);
  assert.equal(location.searchParams.get('state'), state);
  return location.searchParams.get('code');
}

test('authorization_code + PKCE: SPA login yields tokens zuma accepts; id_token carries nonce', async () => {
  const { verifier, challenge } = pkce();
  const code = await login({ challenge, role: 'admin', username: 'murpheux' });
  const { status, json } = await call('POST', '/zuma/token', {
    form: { grant_type: 'authorization_code', code, client_id: SPA, redirect_uri: REDIRECT, code_verifier: verifier },
    headers: { origin: 'http://localhost:8080' },
  });
  assert.equal(status, 200);
  const claims = (await zumaVerifier())(json.access_token);
  assert.equal(claims.sub, 'murpheux');
  assert.deepEqual(claims.roles, ['admin']);
  assert.deepEqual(claims.aud, ['zuma-api', SPA]);
  const idClaims = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64url').toString());
  assert.equal(idClaims.aud, SPA);
  assert.equal(idClaims.nonce, 'n-1');
  assert.ok(json.refresh_token);

  // code is single-use
  const replay = await call('POST', '/zuma/token', {
    form: { grant_type: 'authorization_code', code, client_id: SPA, redirect_uri: REDIRECT, code_verifier: verifier },
  });
  assert.equal(replay.status, 400);

  // refresh rotates and still yields an accepted access token
  const refreshed = await call('POST', '/zuma/token', {
    form: { grant_type: 'refresh_token', refresh_token: json.refresh_token, client_id: SPA },
  });
  assert.equal(refreshed.status, 200);
  assert.equal((await zumaVerifier())(refreshed.json.access_token).sub, 'murpheux');
  const reuse = await call('POST', '/zuma/token', {
    form: { grant_type: 'refresh_token', refresh_token: json.refresh_token, client_id: SPA },
  });
  assert.equal(reuse.status, 400, 'rotated refresh token must not be reusable');

  // userinfo
  const info = await call('GET', '/zuma/userinfo', { headers: { authorization: `Bearer ${refreshed.json.access_token}` } });
  assert.equal(info.json.sub, 'murpheux');
});

test('authorization_code: wrong PKCE verifier, client or redirect_uri are rejected', async () => {
  const cases = [
    ['bad verifier', (v) => ({ code_verifier: `${v}x` })],
    ['wrong client', () => ({ client_id: 'other' })],
    ['wrong redirect', () => ({ redirect_uri: 'http://localhost:8080/other' })],
  ];
  for (const [name, override] of cases) {
    const { verifier, challenge } = pkce();
    const code = await login({ challenge });
    const { status, json } = await call('POST', '/zuma/token', {
      form: { grant_type: 'authorization_code', code, client_id: SPA, redirect_uri: REDIRECT, code_verifier: verifier, ...override(verifier) },
    });
    assert.equal(status, 400, name);
    assert.equal(json.error, 'invalid_grant', name);
  }
});

test('authorize: rejects unregistered redirect_uri and missing PKCE without redirecting', async () => {
  const base = { response_type: 'code', client_id: SPA, code_challenge: 'abc', code_challenge_method: 'S256' };
  const evil = await call('GET', `/zuma/authorize?${new URLSearchParams({ ...base, redirect_uri: 'https://evil.example/cb' })}`);
  assert.equal(evil.status, 400);
  assert.equal(evil.headers.location, undefined);
  const noPkce = await call('GET', `/zuma/authorize?${new URLSearchParams({ ...base, redirect_uri: REDIRECT, code_challenge_method: 'plain' })}`);
  assert.equal(noPkce.status, 400);
});

test('authorize: reflected parameters are HTML-escaped', async () => {
  const xss = '"><script>alert(1)</script>';
  const page = await call(
    'GET',
    `/zuma/authorize?${new URLSearchParams({ response_type: 'code', client_id: SPA, redirect_uri: REDIRECT, state: xss, code_challenge: 'c', code_challenge_method: 'S256' })}`,
  );
  assert.equal(page.status, 200);
  assert.ok(!page.body.includes('<script>'));
  assert.match(page.headers['content-security-policy'], /default-src 'none'/);
  assert.match(page.headers['content-security-policy'], /form-action 'self' http:\/\/localhost:8080;/);
});

test('endsession: redirects only to allow-listed post-logout URIs', async () => {
  const ok = await call('GET', `/zuma/endsession?post_logout_redirect_uri=${encodeURIComponent('http://localhost:8080')}&state=z`);
  assert.equal(ok.status, 302);
  assert.equal(ok.headers.location, 'http://localhost:8080/?state=z');
  const evil = await call('GET', `/zuma/endsession?post_logout_redirect_uri=${encodeURIComponent('https://evil.example')}`);
  assert.equal(evil.status, 200);
  assert.equal(evil.headers.location, undefined);
});

test('healthz, unknown paths and oversized bodies', async () => {
  assert.equal((await call('GET', '/healthz')).status, 200);
  assert.equal((await call('GET', '/other/jwks')).status, 404);
  const big = await call('POST', '/zuma/token', { form: { grant_type: 'client_credentials', scope: 'x'.repeat(20000) } });
  assert.equal(big.status, 413);
});
