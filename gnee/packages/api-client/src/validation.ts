import { isSatsString } from "./sats";
import type { Network } from "./types";

/**
 * Client-side send-form validation. This is UX only — the gateway /
 * transaction-service re-validate everything (including the full bech32
 * checksum), so a value passing here can still be rejected server-side.
 */

const BECH32_HRP: Record<Network, string> = { MAINNET: "bc", TESTNET: "tb", REGTEST: "bcrt" };
// Legacy base58: mainnet P2PKH '1' / P2SH '3'; testnet+regtest P2PKH 'm'/'n' / P2SH '2'.
const BASE58: Record<Network, RegExp> = {
  MAINNET: /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  TESTNET: /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/,
  REGTEST: /^[mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/,
};
const BECH32_DATA = /^[02-9ac-hj-np-z]{6,87}$/;

export const MIN_FEE_RATE = 1;
export const MAX_FEE_RATE = 10_000;

function bech32Hrp(address: string): string | null {
  // Mixed case is invalid bech32; all-upper (QR form) is allowed.
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return null;
  const lower = address.toLowerCase();
  if (lower.length > 90) return null;
  const sep = lower.lastIndexOf("1");
  if (sep < 1) return null;
  return BECH32_DATA.test(lower.slice(sep + 1)) ? lower.slice(0, sep) : null;
}

/** Shape + network-prefix check (bech32 HRP bc/tb/bcrt, base58 1/3 vs m/n/2). No checksum verification. */
export function isAddressForNetwork(address: string, network: Network): boolean {
  return BASE58[network].test(address) || bech32Hrp(address) === BECH32_HRP[network];
}

/** Networks an address could plausibly belong to — used to explain "wrong network" errors. */
export function guessAddressNetworks(address: string): Network[] {
  return (Object.keys(BECH32_HRP) as Network[]).filter((n) => isAddressForNetwork(address, n));
}

export interface SendFormInput {
  destinationAddress: string;
  /** Integer satoshis as a string, or null when the user's amount text couldn't be parsed. */
  amountSats: string | null;
  feeRate: string;
  network: Network;
  /** Wallet balance in integer sats; when provided the amount must not exceed it. */
  balanceSats?: string;
}

export type SendFormField = "destinationAddress" | "amount" | "feeRate";
export type SendFormErrors = Partial<Record<SendFormField, string>>;

export interface SendFormValidation {
  valid: boolean;
  errors: SendFormErrors;
}

const NETWORK_LABEL: Record<Network, string> = { MAINNET: "mainnet", TESTNET: "testnet", REGTEST: "regtest" };

export function validateSendForm(input: SendFormInput): SendFormValidation {
  const errors: SendFormErrors = {};

  const address = input.destinationAddress.trim();
  if (address === "") {
    errors.destinationAddress = "Enter a destination address.";
  } else if (!isAddressForNetwork(address, input.network)) {
    const other = guessAddressNetworks(address);
    errors.destinationAddress =
      other.length > 0
        ? `This looks like a ${other.map((n) => NETWORK_LABEL[n]).join("/")} address, but this wallet is on ${NETWORK_LABEL[input.network]}.`
        : `Not a valid ${NETWORK_LABEL[input.network]} Bitcoin address.`;
  }

  const amount = input.amountSats;
  if (amount === null || !isSatsString(amount)) {
    errors.amount = "Enter a valid amount.";
  } else if (BigInt(amount) <= 0n) {
    errors.amount = "Amount must be greater than zero.";
  } else if (
    input.balanceSats !== undefined &&
    isSatsString(input.balanceSats) &&
    BigInt(amount) > BigInt(input.balanceSats)
  ) {
    errors.amount = "Amount exceeds the wallet balance.";
  }

  const fee = input.feeRate.trim();
  if (!/^[1-9][0-9]*$/.test(fee) || Number(fee) < MIN_FEE_RATE || Number(fee) > MAX_FEE_RATE) {
    errors.feeRate = `Fee rate must be a whole number between ${MIN_FEE_RATE} and ${MAX_FEE_RATE} sat/vB.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
