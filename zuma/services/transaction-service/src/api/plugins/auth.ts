import fp from 'fastify-plugin';
import fastifyJwt, { type TokenOrHeader } from '@fastify/jwt';
import jwksClient from 'jwks-rsa';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError, type Actor } from '@zuma/shared-common';

export interface AuthPluginOptions {
  jwtSecret: string;
  jwtIssuer: string;
  /** When set, verifies RS256 tokens issued by an OIDC provider via its JWKS endpoint instead of the HS256 shared secret. */
  jwksUri?: string;
  /** Required `aud` claim when jwksUri is set; ignored for shared-secret verification. */
  jwtAudience?: string;
}

export interface JwtPayload {
  sub: string;
  roles?: string[];
}

// Normalizes the verified JWT payload into the Actor shape use-cases expect (roles always present).
export const toActor = (payload: JwtPayload): Actor => ({ sub: payload.sub, roles: payload.roles ?? [] });

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
const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  app: FastifyInstance,
  opts: AuthPluginOptions,
) => {
  const secret = opts.jwksUri
    ? buildJwksSecret(opts.jwksUri)
    : opts.jwtSecret;

  await app.register(fastifyJwt, {
    secret,
    verify: {
      allowedIss: opts.jwtIssuer,
      ...(opts.jwksUri && opts.jwtAudience ? { allowedAud: opts.jwtAudience } : {}),
    },
  });

  app.decorate('requireAuth', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
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

// Resolves the RS256 public key for a token by `kid`, fetched (and cached) from the OIDC
// provider's JWKS endpoint — the standard @fastify/jwt escape hatch for provider-rotated keys.
function buildJwksSecret(jwksUri: string) {
  const client = jwksClient({ jwksUri, cache: true, rateLimit: true });
  return async (_request: FastifyRequest, tokenOrHeader: TokenOrHeader): Promise<string> => {
    const { kid } = headerOf(tokenOrHeader);
    if (!kid) {
      throw new Error('JWT is missing a "kid" header; cannot resolve its JWKS signing key');
    }
    const key = await client.getSigningKey(kid);
    return key.getPublicKey();
  };
}

export default fp(authPlugin, { name: 'zuma-auth' });
