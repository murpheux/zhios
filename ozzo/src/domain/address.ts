import {
  normalizeCity,
  normalizePostalCode,
  normalizeStateProvince,
  normalizeStreet,
} from './value-objects';
import { ValidationError } from './errors';

export const ADDRESS_REGIONS = ['US', 'CA', 'UK'] as const;
export type AddressRegion = (typeof ADDRESS_REGIONS)[number];

export interface Address {
  street: string;
  city: string;
  /** US state / CA province code (upper-case); free text county for UK. */
  stateProvince: string;
  country: AddressRegion;
  /** Canonical per-region format (US `12345[-6789]`, CA `A1A 1A1`, UK `SW1A 1AA`). */
  postalCode: string;
}

export interface AddressInput {
  street: string;
  city: string;
  stateProvince: string;
  country: string;
  postalCode: string;
}

export function assertAddressRegion(value: string): AddressRegion {
  const region = value.trim().toUpperCase();
  if (!(ADDRESS_REGIONS as readonly string[]).includes(region)) {
    throw new ValidationError(`Country must be one of: ${ADDRESS_REGIONS.join(', ')}`);
  }
  return region as AddressRegion;
}

export function buildAddress(input: AddressInput): Address {
  const country = assertAddressRegion(input.country);
  return {
    street: normalizeStreet(input.street),
    city: normalizeCity(input.city),
    stateProvince: normalizeStateProvince(input.stateProvince, country),
    country,
    postalCode: normalizePostalCode(input.postalCode, country),
  };
}
