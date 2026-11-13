import type { ContactPerson, NextOfKin, Sex, User } from '../../domain';
import { toAddressDto, type AddressDto } from './address.dto';

export interface NextOfKinDto {
  fullName: string;
  relationship: string;
  phone?: string;
  email?: string;
}

export interface ContactPersonDto {
  fullName: string;
  phone: string;
  email?: string;
}

/** Profile attributes exposed on the wire. SIN/SSN is deliberately absent (write-only). */
export interface UserProfileFieldsDto {
  address: AddressDto | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  nextOfKin: NextOfKinDto | null;
  contactPerson: ContactPersonDto | null;
  sex: Sex | null;
}

const toNextOfKinDto = (k: NextOfKin): NextOfKinDto => ({ ...k });
const toContactPersonDto = (c: ContactPerson): ContactPersonDto => ({ ...c });

export function toProfileFieldsDto(user: User): UserProfileFieldsDto {
  return {
    address: user.address ? toAddressDto(user.address) : null,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    nextOfKin: user.nextOfKin ? toNextOfKinDto(user.nextOfKin) : null,
    contactPerson: user.contactPerson ? toContactPersonDto(user.contactPerson) : null,
    sex: user.sex,
  };
}
