import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Actor } from '../../application/actor';
import type { TokenVerifier } from '../../application/ports';
import { UnauthorizedError } from '../../domain';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

/** onRequest hook: validates the bearer JWT (Okta/OIDC via JWKS) and attaches `request.actor`. */
export function createAuthHook(verifier: TokenVerifier, adminGroup: string) {
  return async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const match = header ? BEARER.exec(header) : null;
    if (!match?.[1]) throw new UnauthorizedError('Missing bearer token');
    const token = match[1];
    const claims = await verifier.verify(token);
    request.actor = { sub: claims.sub, isAdmin: claims.groups.includes(adminGroup), token };
  };
}
