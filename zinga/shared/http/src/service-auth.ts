import { createHmac, timingSafeEqual } from 'node:crypto';
import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '@zinga/shared-common';

// Service-to-service authentication: short-lived HS256 JWTs signed with INTERNAL_JWT_SECRET
// (never the user-token JWT_SECRET), sent in the `x-service-token` header, audience-bound to
// the receiving service's SERVICE_NAME.

export const SERVICE_TOKEN_HEADER = 'x-service-token';
export const SERVICE_ROLE = 'service';
const MIN_SECRET_LENGTH = 32;
const DEFAULT_CLOCK_SKEW_SECONDS = 5;
const MAX_TTL_SECONDS = 300;

export interface ServiceTokenSignerOptions {
  secret: string;
  issuer: string;
  /** The calling service's name; becomes the token `sub`. */
  serviceName: string;
  /** Token lifetime; default 60s, max 300s. */
  ttlSeconds?: number;
  /** Clock override for tests. */
  now?: () => number;
}

export interface ServiceTokenSigner {
  /** Signs a token for the given receiving service (its SERVICE_NAME). */
  sign(audience: string): string;
}

export interface ServiceTokenClaims {
  sub: string;
  aud: string;
  role: typeof SERVICE_ROLE;
  iss: string;
  iat: number;
  exp: number;
}

export interface VerifyServiceTokenOptions {
  secret: string;
  issuer: string;
  /** This (receiving) service's name; the token `aud` must equal it. */
  audience: string;
  /** If set, the token `sub` (calling service) must equal it. */
  expectedSubject?: string;
  clockSkewSeconds?: number;
  now?: () => number;
}

const base64UrlJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

const hmac = (secret: string, data: string): Buffer =>
  createHmac('sha256', secret).update(data).digest();

const nowSeconds = (now: () => number): number => Math.floor(now() / 1000);

const assertSecret = (secret: string): void => {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`service token secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
};

const HEADER_SEGMENT = base64UrlJson({ alg: 'HS256', typ: 'JWT' });

export const createServiceTokenSigner = ({
  secret,
  issuer,
  serviceName,
  ttlSeconds = 60,
  now = Date.now,
}: ServiceTokenSignerOptions): ServiceTokenSigner => {
  assertSecret(secret);
  if (!serviceName) { throw new Error('serviceName is required'); }
  if (!issuer) { throw new Error('issuer is required'); }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(`ttlSeconds must be an integer in (0, ${MAX_TTL_SECONDS}]`);
  }

  return {
    sign(audience: string): string {
      if (!audience) { throw new Error('audience is required'); }
      const iat = nowSeconds(now);
      const claims: ServiceTokenClaims = {
        sub: serviceName,
        aud: audience,
        role: SERVICE_ROLE,
        iss: issuer,
        iat,
        exp: iat + ttlSeconds,
      };
      const signingInput = `${HEADER_SEGMENT}.${base64UrlJson(claims)}`;
      return `${signingInput}.${hmac(secret, signingInput).toString('base64url')}`;
    },
  };
};

const reject = (reason: string): never => {
  throw new UnauthorizedError(`Invalid service token: ${reason}`);
};

const parseSegment = (segment: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return reject('malformed');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof UnauthorizedError) { throw error; }
    return reject('malformed');
  }
};

// Verifies signature (constant-time), algorithm, issuer, audience, role and expiry; returns the
// calling service name (`sub`). Throws UnauthorizedError on any failure.
export const verifyServiceToken = (token: string, opts: VerifyServiceTokenOptions): string => {
  assertSecret(opts.secret);
  const skew = opts.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) { return reject('malformed'); }
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = parseSegment(headerSegment);
  if (header.alg !== 'HS256') { return reject('unsupported algorithm'); }

  const expected = hmac(opts.secret, `${headerSegment}.${payloadSegment}`);
  const actual = Buffer.from(signatureSegment, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return reject('bad signature');
  }

  const claims = parseSegment(payloadSegment);
  const now = nowSeconds(opts.now ?? Date.now);
  if (claims.iss !== opts.issuer) { return reject('issuer mismatch'); }
  if (claims.aud !== opts.audience) { return reject('audience mismatch'); }
  if (claims.role !== SERVICE_ROLE) { return reject('role mismatch'); }
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) { return reject('missing sub'); }
  if (opts.expectedSubject !== undefined && claims.sub !== opts.expectedSubject) {
    return reject('subject mismatch');
  }
  if (typeof claims.exp !== 'number' || claims.exp + skew <= now) { return reject('expired'); }
  if (typeof claims.iat === 'number' && claims.iat - skew > now) { return reject('issued in the future'); }
  return claims.sub;
};

export interface ServiceAuthPluginOptions {
  /** INTERNAL_JWT_SECRET */
  secret: string;
  /** INTERNAL_JWT_ISSUER */
  issuer: string;
  /** This service's SERVICE_NAME; tokens must carry aud === serviceName. */
  serviceName: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifies `x-service-token` and sets request.serviceCaller; 401 otherwise. */
    requireService: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /** Calling service name (token `sub`); '' until requireService has run successfully. */
    serviceCaller: string;
  }
}

const serviceAuthPluginImpl: FastifyPluginAsync<ServiceAuthPluginOptions> = async (
  app: FastifyInstance,
  opts: ServiceAuthPluginOptions,
) => {
  assertSecret(opts.secret);
  if (!opts.serviceName) { throw new Error('serviceAuthPlugin: serviceName is required'); }

  app.decorateRequest('serviceCaller', '');

  app.decorate('requireService', async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers[SERVICE_TOKEN_HEADER];
    if (typeof header !== 'string' || header.length === 0) {
      throw new UnauthorizedError('Missing service token');
    }
    try {
      request.serviceCaller = verifyServiceToken(header, {
        secret: opts.secret,
        issuer: opts.issuer,
        audience: opts.serviceName,
      });
    } catch (error) {
      request.log.warn({ err: error }, 'service token rejected');
      throw new UnauthorizedError('Invalid service token');
    }
  });
};

export const serviceAuthPlugin = fp(serviceAuthPluginImpl, { name: 'zuma-service-auth' });

// preHandler (use after app.requireService): 403 unless the verified caller is in `names`.
export const allowServiceCallers = (...names: string[]) => {
  const allowed = new Set(names);
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.serviceCaller || !allowed.has(request.serviceCaller)) {
      throw new ForbiddenError('Service caller not allowed');
    }
  };
};
