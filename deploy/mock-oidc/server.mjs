// zhios dev OIDC provider — LOCAL DEVELOPMENT ONLY. Node stdlib, no dependencies.
//
// Replaces ghcr.io/navikt/mock-oauth2-server, whose claim mappings were not applied in our setup.
// Behaviour is deliberately small and explicit:
//   - issuer is FIXED from $ISSUER (e.g. http://localhost:8090/zuma), never derived from the Host
//     header, so tokens are identical whether reached via localhost, an SSH tunnel or the
//     in-network name (mock-oidc:8080)
//   - client_credentials: persona chosen by `scope` (config.json -> clientCredentials.scopes)
//   - authorization_code + PKCE (S256 required) for the SPA, with a dev login form (any username)
//   - refresh_token rotation, userinfo, end-session, JWKS (RS256 key generated at start-up)
// It signs a token for any username. Never expose it beyond localhost.
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const CODE_TTL_SECONDS = 60;
const MAX_BODY_BYTES = 16 * 1024;
const ROLE_CHOICES = ['user', 'admin', 'auditor'];

const b64url = (input) => Buffer.from(input).toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);
const splitList = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function loadSettings(env = process.env) {
  if (!env.ISSUER) throw new Error('ISSUER is required (e.g. http://localhost:8090/zuma)');
  const issuer = env.ISSUER.replace(/\/+$/, '');
  const config = JSON.parse(readFileSync(env.CONFIG_PATH ?? new URL('./config.json', import.meta.url), 'utf8'));
  return {
    issuer,
    basePath: new URL(issuer).pathname.replace(/\/+$/, ''),
    port: Number(env.PORT ?? 8080),
    allowedRedirectUris: splitList(env.ALLOWED_REDIRECT_URIS),
    allowedPostLogoutRedirectUris: splitList(env.ALLOWED_POST_LOGOUT_REDIRECT_URIS),
    allowedOrigins: splitList(env.ALLOWED_ORIGINS),
    config,
  };
}

export function createProvider(settings) {
  const { issuer, basePath, config } = settings;
  const tokenExpiry = config.tokenExpirySeconds ?? 3600;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const kid = createHash('sha256').update(`${publicJwk.n}.${publicJwk.e}`).digest('base64url').slice(0, 16);
  const jwks = { keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }] };
  const codes = new Map(); // code -> grant
  const redirectOrigins = [...new Set(settings.allowedRedirectUris.map((u) => new URL(u).origin))].join(' ');
  const refreshTokens = new Map(); // token -> grant

  const signJwt = (claims) => {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
    const payload = b64url(JSON.stringify(claims));
    const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    return `${header}.${payload}.${signature}`;
  };

  const verifyJwt = (token) => {
    const [header, payload, signature] = String(token).split('.');
    if (!header || !payload || !signature) return null;
    const ok = verify('sha256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'));
    if (!ok) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims.exp > nowSeconds() ? claims : null;
  };

  const issueTokens = ({ sub, roles, audience, clientId, scope, nonce, withIdToken, withRefresh }) => {
    const iat = nowSeconds();
    const base = { iss: issuer, sub, iat, nbf: iat, exp: iat + tokenExpiry };
    const body = {
      token_type: 'Bearer',
      expires_in: tokenExpiry,
      scope,
      access_token: signJwt({ ...base, aud: audience, roles, scope, client_id: clientId, jti: randomUUID() }),
    };
    if (withIdToken) {
      body.id_token = signJwt({
        ...base,
        aud: clientId,
        auth_time: iat,
        preferred_username: sub,
        name: sub,
        roles,
        ...(nonce ? { nonce } : {}),
      });
    }
    if (withRefresh) {
      const refreshToken = randomBytes(32).toString('base64url');
      refreshTokens.set(refreshToken, { sub, roles, audience, clientId, scope });
      body.refresh_token = refreshToken;
    }
    return body;
  };

  const discovery = () => ({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    userinfo_endpoint: `${issuer}/userinfo`,
    end_session_endpoint: `${issuer}/endsession`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access', ...Object.keys(config.clientCredentials?.scopes ?? {})],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'roles', 'preferred_username', 'name', 'nonce'],
  });

  // --- token endpoint -------------------------------------------------------------------------

  const tokenError = (status, error, description) => ({ status, json: { error, error_description: description } });

  const clientIdFrom = (form, headers) => {
    const auth = headers.authorization ?? '';
    if (auth.startsWith('Basic ')) {
      const [id] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':');
      return decodeURIComponent(id ?? '');
    }
    return form.get('client_id') ?? '';
  };

  const handleToken = (form, headers) => {
    const grantType = form.get('grant_type');
    const clientId = clientIdFrom(form, headers);

    if (grantType === 'client_credentials') {
      const requested = (form.get('scope') ?? '').split(/\s+/).filter(Boolean);
      const scopes = config.clientCredentials?.scopes ?? {};
      const match = requested.find((s) => Object.hasOwn(scopes, s));
      if (!match) {
        return tokenError(400, 'invalid_scope', `scope must include one of: ${Object.keys(scopes).join(', ')}`);
      }
      const persona = scopes[match];
      return {
        status: 200,
        json: issueTokens({
          sub: persona.sub,
          roles: persona.roles ?? [],
          audience: config.clientCredentials.audience,
          clientId,
          scope: match,
        }),
      };
    }

    if (grantType === 'authorization_code') {
      const code = form.get('code') ?? '';
      const grant = codes.get(code);
      codes.delete(code); // single use, even on failure
      if (!grant || grant.expiresAt < nowSeconds()) return tokenError(400, 'invalid_grant', 'unknown or expired code');
      if (grant.clientId !== clientId) return tokenError(400, 'invalid_grant', 'client_id mismatch');
      if (grant.redirectUri !== form.get('redirect_uri')) return tokenError(400, 'invalid_grant', 'redirect_uri mismatch');
      const verifier = form.get('code_verifier') ?? '';
      if (createHash('sha256').update(verifier).digest('base64url') !== grant.codeChallenge) {
        return tokenError(400, 'invalid_grant', 'PKCE verification failed');
      }
      return {
        status: 200,
        json: issueTokens({ ...grant, withIdToken: true, withRefresh: true }),
      };
    }

    if (grantType === 'refresh_token') {
      const token = form.get('refresh_token') ?? '';
      const grant = refreshTokens.get(token);
      refreshTokens.delete(token); // rotation
      if (!grant || grant.clientId !== clientId) return tokenError(400, 'invalid_grant', 'unknown refresh_token');
      return { status: 200, json: issueTokens({ ...grant, withIdToken: true, withRefresh: true }) };
    }

    return tokenError(400, 'unsupported_grant_type', `unsupported grant_type '${grantType ?? ''}'`);
  };

  // --- authorization endpoint (dev login form) ---------------------------------------------

  const authorizeParams = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method'];

  const validateAuthorize = (params) => {
    if (params.get('response_type') !== 'code') return 'response_type must be "code"';
    if (!params.get('client_id')) return 'client_id is required';
    if (!settings.allowedRedirectUris.includes(params.get('redirect_uri') ?? '')) return 'redirect_uri is not allowed';
    if (params.get('code_challenge_method') !== 'S256' || !params.get('code_challenge')) return 'PKCE (S256) is required';
    return null;
  };

  const loginPage = (params, error) => {
    const hidden = authorizeParams
      .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name))}">`)
      .join('\n      ');
    const options = ROLE_CHOICES.map((r) => `<option value="${r}">${r}</option>`).join('');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>zhios dev login</title>
<style>body{font:16px system-ui;max-width:28rem;margin:4rem auto}label{display:block;margin:.75rem 0}input,select{font:inherit;width:100%;padding:.4rem}button{font:inherit;padding:.5rem 1rem;margin-top:1rem}.warn{color:#8a5a00}.err{color:#b00020}</style>
</head><body>
  <h1>zhios dev login</h1>
  <p class="warn">Local development identity provider. Any username is accepted.</p>
  ${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
  <form method="post" action="${escapeHtml(`${basePath}/authorize`)}">
      ${hidden}
    <label>Username <input name="username" value="dev-user" required maxlength="64" pattern="[A-Za-z0-9._@-]+"></label>
    <label>Role <select name="role">${options}</select></label>
    <button type="submit">Sign in</button>
  </form>
</body></html>`;
  };

  const handleAuthorizeSubmit = (form) => {
    const problem = validateAuthorize(form);
    if (problem) return { status: 400, html: loginPage(form, problem) };
    const username = form.get('username') ?? '';
    if (!/^[A-Za-z0-9._@-]{1,64}$/.test(username)) return { status: 400, html: loginPage(form, 'invalid username') };
    const role = ROLE_CHOICES.includes(form.get('role')) ? form.get('role') : 'user';
    const code = randomBytes(32).toString('base64url');
    codes.set(code, {
      sub: username,
      roles: [role],
      audience: [...(config.interactive?.audience ?? ['zuma-api']), form.get('client_id')],
      clientId: form.get('client_id'),
      scope: form.get('scope') ?? 'openid',
      nonce: form.get('nonce') || undefined,
      redirectUri: form.get('redirect_uri'),
      codeChallenge: form.get('code_challenge'),
      expiresAt: nowSeconds() + CODE_TTL_SECONDS,
    });
    const target = new URL(form.get('redirect_uri'));
    target.searchParams.set('code', code);
    if (form.get('state')) target.searchParams.set('state', form.get('state'));
    return { status: 302, location: target.toString() };
  };

  // --- HTTP plumbing ------------------------------------------------------------------------

  const readForm = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('body too large'), { status: 413 }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));
      req.on('error', reject);
    });

  const send = (res, status, body, headers = {}) => {
    res.statusCode = status;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.end(body);
  };
  const sendJson = (res, status, json, extra = {}) =>
    send(res, status, JSON.stringify(json), { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra });

  const cors = (req) => {
    const origin = req.headers.origin;
    return origin && settings.allowedOrigins.includes(origin)
      ? { 'access-control-allow-origin': origin, vary: 'Origin' }
      : {};
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://internal');
    const path = url.pathname;
    const corsHeaders = cors(req);
    try {
      if (path === '/healthz') return send(res, 200, 'ok\n', { 'content-type': 'text/plain' });
      if (!path.startsWith(`${basePath}/`)) return sendJson(res, 404, { error: 'not_found' });
      const route = path.slice(basePath.length);

      if (req.method === 'OPTIONS') {
        return send(res, 204, '', {
          ...corsHeaders,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '600',
        });
      }

      if (req.method === 'GET' && route === '/.well-known/openid-configuration') return sendJson(res, 200, discovery(), corsHeaders);
      if (req.method === 'GET' && route === '/jwks') return sendJson(res, 200, jwks, corsHeaders);

      if (req.method === 'POST' && route === '/token') {
        const result = handleToken(await readForm(req), req.headers);
        return sendJson(res, result.status, result.json, corsHeaders);
      }

      if (req.method === 'GET' && route === '/authorize') {
        const problem = validateAuthorize(url.searchParams);
        // Never redirect to an unvalidated redirect_uri: errors render here instead.
        return send(res, problem ? 400 : 200, loginPage(url.searchParams, problem), {
          'content-type': 'text/html; charset=utf-8',
          // form-action also governs the redirect that follows the POST (Chrome), so the registered
          // redirect_uri origins must be listed alongside 'self'.
          'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirectOrigins}; frame-ancestors 'self'`,
          'cache-control': 'no-store',
        });
      }
      if (req.method === 'POST' && route === '/authorize') {
        const result = handleAuthorizeSubmit(await readForm(req));
        if (result.location) return send(res, 302, '', { location: result.location, 'cache-control': 'no-store' });
        return send(res, result.status, result.html, { 'content-type': 'text/html; charset=utf-8' });
      }

      if (req.method === 'GET' && route === '/userinfo') {
        const auth = req.headers.authorization ?? '';
        const claims = auth.startsWith('Bearer ') ? verifyJwt(auth.slice(7)) : null;
        if (!claims) return sendJson(res, 401, { error: 'invalid_token' }, corsHeaders);
        return sendJson(res, 200, { sub: claims.sub, preferred_username: claims.sub, name: claims.sub, roles: claims.roles ?? [] }, corsHeaders);
      }

      if (req.method === 'GET' && route === '/endsession') {
        const target = url.searchParams.get('post_logout_redirect_uri');
        if (target && settings.allowedPostLogoutRedirectUris.includes(target)) {
          const location = new URL(target);
          if (url.searchParams.get('state')) location.searchParams.set('state', url.searchParams.get('state'));
          return send(res, 302, '', { location: location.toString() });
        }
        return send(res, 200, 'signed out\n', { 'content-type': 'text/plain' });
      }

      return sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      return sendJson(res, error.status ?? 500, { error: error.status === 413 ? 'request_too_large' : 'server_error' }, corsHeaders);
    }
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const settings = loadSettings();
  const handle = createProvider(settings);
  const server = createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      // One line per request; never logs bodies, tokens or query strings.
      console.log(JSON.stringify({ t: new Date().toISOString(), method: req.method, path: req.url.split('?')[0], status: res.statusCode, ms: Date.now() - started }));
    });
    handle(req, res);
  });
  server.listen(settings.port, () => console.log(JSON.stringify({ msg: 'zhios dev OIDC provider listening', port: settings.port, issuer: settings.issuer })));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
