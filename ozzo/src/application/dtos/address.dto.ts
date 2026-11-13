import { z } from 'zod';
import type { Address, AddressRegion } from '../../domain';

export const AddressRequestSchema = z
  .object({
    street: z.string(),
    city: z.string(),
    stateProvince: z.string(),
    country: z.string(),
    postalCode: z.string(),
  })
  .strict();
export type AddressRequest = z.infer<typeof AddressRequestSchema>;

/** Wire representation of an address. Never carries SIN/SSN. */
export interface AddressDto {
  street: string;
  city: string;
  stateProvince: string;
  country: AddressRegion;
  postalCode: string;
}

export function toAddressDto(address: Address): AddressDto {
  return {
    street: address.street,
    city: address.city,
    stateProvince: address.stateProvince,
    country: address.country,
    postalCode: address.postalCode,
  };
}
