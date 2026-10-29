import type { WalletNetwork } from '../../domain/value-objects/network';

// Generates a receiving address for a new wallet; production impl would derive from HD seed in HSM/KMS.
export interface AddressGeneratorPort {
  generate(network: WalletNetwork): Promise<string>;
}
