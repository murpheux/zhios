import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

// Hand-rolled HS256 signer so tests can forge tokens (bad iss, missing exp, alg none, ...) independently
// of the plugin under test.
export const signHs256 = (
  payload: Record<string, unknown>,
  secret: string,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string => {
  const input = `${b64(header)}.${b64(payload)}`;
  return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
};

export const generateRsaKeyPair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

export const signRs256 = (
  payload: Record<string, unknown>,
  privateKeyPem: string,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' },
): string => {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = createSign('RSA-SHA256').update(input).sign(privateKeyPem).toString('base64url');
  return `${input}.${signature}`;
};
