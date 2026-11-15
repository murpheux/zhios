// Pulls @fastify/jwt request/instance typings (request.user, jwtVerify) into consumers of the emitted .d.ts.
/// <reference types="@fastify/jwt" preserve="true" />
import fp from 'fastify-plugin';
import fastifyJwt, { type TokenOrHeader } from '@fastify/jwt';
import jwksClient from 'jwks-rsa';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError, type Actor } from '@zinga/shared-common';

export type AsymmetricAlgorithm =
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512';

export interface AuthPluginOptions {
  /** HS256 shared secret; used only when jwksUri is not set. */
  jwtSecret: string;
  jwtIssuer: string;
  /** When set, verifies asymmetric tokens via the OIDC provider's JWKS endpoint instead of the HS256 secret. */
  jwksUri?: string;
  /** Required `aud` claim; mandatory when jwksUri is set (plugin refuses to start otherwise). */
  jwtAudience?: string;
  /** Algorithms accepted on the JWKS path. Defaults to ['RS256']. */
  jwksAlgorithms?: AsymmetricAlgorithm[];
}

export interface JwtPayload {
  sub: string;
  roles?: string[];
  exp?: number; // Unix timestamp when token expires
  iss?: string; // Issuer
  aud?: string; // Audience
}

// Normalizes the verified JWT payload into the Actor shape use-cases expect (roles always present).
export const toActor = (payload: JwtPayload): Actor => ({
  sub: payload.sub,
  roles: payload.roles ?? [],
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (role: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const headerOf = (tokenOrHeader: TokenOrHeader) =>
  'header' in tokenOrHeader ? tokenOrHeader.header : tokenOrHeader;

// Registers @fastify/jwt and decorates requireAuth/requireRole preHandlers.
// Algorithms are always pinned (HS256 for the shared secret, an asymmetric allow-list for JWKS)
// so a token can never pick its own verification algorithm.
const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (
  app: FastifyInstance,
  opts: AuthPluginOptions,
) => {
  if (opts.jwksUri) {
    if (!opts.jwtAudience) {
      throw new Error('authPlugin: jwtAudience is required when jwksUri is set');
    }
    const jwks = jwksClient({ jwksUri: opts.jwksUri, cache: true, rateLimit: true, timeout: JWKS_FETCH_TIMEOUT_MS });
    await app.register(fastifyJwt, {
      secret: jwksSecret(jwks),
      // The secret callback needs the token header (kid); without `complete` it only gets the payload.
      decode: { complete: true },
      verify: {
        algorithms: opts.jwksAlgorithms?.length ? opts.jwksAlgorithms : ['RS256'],
        allowedIss: opts.jwtIssuer,
        allowedAud: opts.jwtAudience,
        // allowedIss/allowedAud are only enforced when the claim is present, so require both.
        requiredClaims: ['sub', 'exp', 'iss', 'aud'],
      },
    });
    // Warm the JWKS cache in the background once the app is ready, so the first authenticated
    // request after a (re)start doesn't pay for the key fetch. Measured ~2.2s cold, which tripped
    // wallet-service's call into transaction-service. Never blocks startup; failure is non-fatal
    // because keys are still fetched on demand.
    app.addHook('onReady', async () => {
      void jwks.getSigningKeys().then(
        (keys) => app.log.info({ jwksKeys: keys.length }, 'jwks cache warmed'),
        (error: unknown) =>
          app.log.warn({ jwksError: (error as { message?: string }).message }, 'jwks warm-up failed; keys will be fetched on demand'),
      );
    });
  } else {
    await app.register(fastifyJwt, {
      secret: opts.jwtSecret,
      sign: { algorithm: 'HS256', iss: opts.jwtIssuer },
      verify: {
        algorithms: ['HS256'],
        allowedIss: opts.jwtIssuer,
        ...(opts.jwtAudience ? { allowedAud: opts.jwtAudience } : {}),
        requiredClaims: ['sub', 'exp', 'iss', ...(opts.jwtAudience ? ['aud'] : [])],
      },
    });
  }

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (error) {
      // warn, not debug: a misconfigured issuer/audience/JWKS otherwise shows up only as a bare 401.
      // Logs the verifier's code + message (e.g. FAST_JWT_CLAIM_VALUE_INVALID: "The aud claim value
      // is not allowed."), never the token itself.
      const { code, message } = error as { code?: string; message?: string };
      request.log.warn({ authError: { code, message } }, 'jwt verification failed');
      throw new UnauthorizedError('Invalid or missing authentication token');
    }
  });

  app.decorate('requireRole', (role: string) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const roles = request.user?.roles ?? [];
      if (!roles.includes(role)) {
        throw new ForbiddenError(`Requires role '${role}'`);
      }
    };
  });
};

const JWKS_FETCH_TIMEOUT_MS = 5000;

// Resolves the public key for a token by `kid`, fetched (and cached) from the OIDC provider's
// JWKS endpoint — the standard @fastify/jwt escape hatch for provider-rotated keys.
function jwksSecret(client: jwksClient.JwksClient) {
  return async (_request: FastifyRequest, tokenOrHeader: TokenOrHeader): Promise<string> => {
    const { kid } = headerOf(tokenOrHeader);
    if (!kid) {
      throw new Error('JWT is missing a "kid" header; cannot resolve its JWKS signing key');
    }
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  };
}

export const authPlugin = fp(authPluginImpl, { name: 'zuma-auth' });
