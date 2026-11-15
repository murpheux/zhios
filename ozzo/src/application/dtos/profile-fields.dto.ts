import type { User } from '../../domain';
import { toAddressDto, type AddressDto } from './address.dto';

/** Profile attributes exposed on the wire. SIN/SSN is deliberately absent (write-only). */
export interface UserProfileFieldsDto {
  address: AddressDto | null;
  /** `YYYY-MM-DD` from identity.dateOfBirth. */
  dateOfBirth: string | null;
  /** Next of kin from emergencyContacts.nextOfKin. */
  nextOfKin: {
    fullName: string;
    relationship: string;
    phone?: string;
    email?: string;
  } | null;
  /** Primary contact person from emergencyContacts.primaryContact. */
  contactPerson: {
    fullName: string;
    phone: string;
    email?: string;
  } | null;
  /** Sex from identity.sex. */
  sex: string | null;
}

export function toProfileFieldsDto(user: User): UserProfileFieldsDto {
  const identity = user.identity as any;
  const emergencyContacts = user.emergencyContacts as any;

  return {
    address: user.address ? toAddressDto(user.address) : null,
    dateOfBirth: identity?.dateOfBirth
      ? new Date(identity.dateOfBirth).toISOString().slice(0, 10)
      : null,
    nextOfKin: emergencyContacts?.nextOfKin ? { ...emergencyContacts.nextOfKin } : null,
    contactPerson: emergencyContacts?.primaryContact
      ? {
          fullName: emergencyContacts.primaryContact.fullName,
          phone: emergencyContacts.primaryContact.phone,
          email: emergencyContacts.primaryContact.email,
        }
      : null,
    sex: identity?.sex || null,
  };
}
