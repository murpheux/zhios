import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SERVICE_TOKEN_HEADER = 'x-service-token';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

// Plain onRequest hook: the x-service-token header must equal one of the configured tokens.
// Digests are compared in constant time so response timing doesn't leak token prefixes.
export const serviceTokenMiddleware = (allowedTokens: readonly string[]) => {
  const allowed = allowedTokens.map(digest);
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers[SERVICE_TOKEN_HEADER];
    const token = typeof header === 'string' ? header : undefined;
    const presented = token === undefined ? undefined : digest(token);
    // Check every candidate (no early exit) so timing doesn't depend on which one matches.
    const ok =
      presented !== undefined && allowed.reduce((acc, d) => timingSafeEqual(d, presented) || acc, false);
    if (!ok) {
      return reply
        .status(401)
        .send({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Missing or invalid service token' });
    }
  };
};
