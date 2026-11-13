import type { SensitiveDataContext, SensitiveDataPort } from '../application/ports';

const PREFIX = 'mock-kms:v1:';

/**
 * LOCAL DEVELOPMENT / TEST ONLY. Base64 is encoding, not encryption: it offers no confidentiality.
 * Replace with an AWS KMS adapter for any real environment; construction is refused in production.
 * The context is bound into the payload to mimic KMS EncryptionContext mismatch behaviour.
 */
export class MockKmsAdapter implements SensitiveDataPort {
  constructor(nodeEnv: string = process.env.NODE_ENV ?? 'development') {
    if (nodeEnv === 'production') {
      throw new Error('MockKmsAdapter must not be used in production; configure a real KMS adapter');
    }
  }

  async encrypt(plaintext: string, context: SensitiveDataContext = {}): Promise<string> {
    const payload = JSON.stringify({ c: sortedContext(context), p: plaintext });
    return PREFIX + Buffer.from(payload, 'utf8').toString('base64');
  }

  async decrypt(ciphertext: string, context: SensitiveDataContext = {}): Promise<string> {
    if (!ciphertext.startsWith(PREFIX)) throw new Error('Malformed ciphertext');
    let parsed: { c?: unknown; p?: unknown };
    try {
      parsed = JSON.parse(Buffer.from(ciphertext.slice(PREFIX.length), 'base64').toString('utf8'));
    } catch {
      throw new Error('Malformed ciphertext');
    }
    if (typeof parsed.p !== 'string' || JSON.stringify(parsed.c) !== JSON.stringify(sortedContext(context))) {
      throw new Error('Ciphertext context mismatch');
    }
    return parsed.p;
  }
}

function sortedContext(context: SensitiveDataContext): [string, string][] {
  return Object.entries(context).sort(([a], [b]) => a.localeCompare(b));
}
