import { randomBytes } from 'node:crypto';
import type { AddressGeneratorPort } from '../../application/ports/address-generator.port';
import type { WalletNetwork } from '../../domain/value-objects/network';

// MOCK address generator for local/test use only.
// Production must derive addresses from an HD wallet seed held in an HSM/KMS, never in-process.
export class MockAddressGenerator implements AddressGeneratorPort {
  async generate(network: WalletNetwork): Promise<string> {
    const prefix = network === 'mainnet' ? 'bc1q' : network === 'testnet' ? 'tb1q' : 'bcrt1q';
    return `${prefix}${randomBytes(20).toString('hex')}`;
  }
}
