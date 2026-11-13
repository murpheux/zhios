import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { TokenClaims, TokenVerifier } from '../application/ports';
import { UnauthorizedError } from '../domain';

export interface OktaVerifierOptions {
  issuer: string;
  audience: string;
  jwksUri: string;
  /** Override for tests. */
  keySet?: JWTVerifyGetKey;
}

export class OktaTokenVerifier implements TokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(private readonly opts: OktaVerifierOptions) {
    this.keys = opts.keySet ?? createRemoteJWKSet(new URL(opts.jwksUri));
  }

  async verify(token: string): Promise<TokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.opts.issuer,
        audience: this.opts.audience,
        algorithms: ['RS256'],
        clockTolerance: 5,
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new UnauthorizedError('Token has no subject');
      }
      const groups = Array.isArray(payload.groups)
        ? payload.groups.filter((g): g is string => typeof g === 'string')
        : [];
      return { sub: payload.sub, groups };
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      if (err instanceof errors.JOSEError) throw new UnauthorizedError('Invalid or expired token');
      // JWKS fetch/network failures: treat as unauthenticated rather than leaking internals.
      throw new UnauthorizedError('Token could not be verified');
    }
  }
}
