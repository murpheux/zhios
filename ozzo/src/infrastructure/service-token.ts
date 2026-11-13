import { createHmac } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

export interface ServiceTokenSignerOptions {
  secret: string;
  issuer: string;
  /** This service's name; becomes the token `sub`. */
  serviceName: string;
  ttlSeconds?: number;
  now?: () => number;
}

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

/**
 * Signs short-lived HS256 service tokens in the format zuma's `requireService` verifies:
 * { sub, aud, role: 'service', iss, iat, exp } signed with INTERNAL_JWT_SECRET.
 */
export function createServiceTokenSigner(opts: ServiceTokenSignerOptions) {
  if (opts.secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`service token secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const ttl = Math.min(opts.ttlSeconds ?? 60, 300);
  const now = opts.now ?? Date.now;
  return {
    sign(audience: string): string {
      const iat = Math.floor(now() / 1000);
      const payload = {
        sub: opts.serviceName,
        aud: audience,
        role: 'service',
        iss: opts.issuer,
        iat,
        exp: iat + ttl,
      };
      const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
      const sig = createHmac('sha256', opts.secret).update(data).digest('base64url');
      return `${data}.${sig}`;
    },
  };
}
