import type { WalletEntity } from '../../domain/entities/wallet.entity';
import { formatSats } from '../../domain/value-objects/satoshi';

export type WalletResponse = Omit<WalletEntity, 'balanceSats'> & { balanceCache: string };

// Maps the domain entity to the public wire shape: integer satoshis stay internal, the API keeps the
// historical `balanceCache` field as a satoshi decimal string for client compatibility.
export const toWalletResponse = ({ balanceSats, ...rest }: WalletEntity): WalletResponse => ({
  ...rest,
  balanceCache: formatSats(balanceSats),
});
