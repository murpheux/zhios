import { randomInt } from 'node:crypto';
import type { AccountNumberGenerator } from '../application/ports';

const LENGTH = 12;

export class CryptoAccountNumberGenerator implements AccountNumberGenerator {
  generate(): string {
    let out = String(randomInt(1, 10));
    for (let i = 1; i < LENGTH; i++) out += String(randomInt(0, 10));
    return out;
  }
}
