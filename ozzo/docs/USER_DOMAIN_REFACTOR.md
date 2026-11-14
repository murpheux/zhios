# User Domain Refactoring

## Overview

The User domain has been refactored to separate concerns and improve maintainability. The core `User` entity is now focused on **identity and authentication**, with related data organized into separate value objects.

## Architecture

```
User (Core Entity)
├── Identity & Authentication
│   ├── id, username, email, externalId
│   ├── roles, permissions
│   ├── isActive, emailVerified, phoneVerified
│   ├── lastLoginAt, lastPasswordChangeAt
│   └── mfaEnabled
│
├── UserIdentity (Value Object)
│   ├── middleName, preferredName, displayName
│   ├── profilePhotoUrl, nationality, preferredLanguage
│   ├── maritalStatus, dateOfBirth, sex
│
├── UserContact (Value Object)
│   ├── phoneNumber, mobileNumber, secondaryEmail
│
├── Address (Value Object)
│   ├── street, city, stateProvince, country, postalCode
│
├── UserPreferences (Value Object)
│   ├── timeZone, locale, theme
│   ├── NotificationPreferences
│   │   ├── emailNotifications, smsNotifications
│   │   ├── inAppNotifications, marketingEmails
│
├── UserEmergencyContacts (Value Object)
│   ├── primaryContact, secondaryContact
│   ├── nextOfKin (legacy)
│
├── UserEmployment (Value Object)
│   ├── employeeNumber, departmentId, jobTitle
│   ├── managerId, hireDate, employmentStatus
│
├── UserCompliance (Value Object)
│   ├── encryptedTaxId
│   ├── termsAcceptedAt, privacyPolicyAcceptedAt
│   ├── marketingConsent, marketingConsentUpdatedAt
│
├── ExternalIds (Value Object)
│   ├── okta, azureAd, google, employeeSystem
│
└── UserAudit (Value Object)
    ├── createdBy, updatedBy
    ├── deletedAt, deactivatedAt
    ├── isDeleted, createdAt, updatedAt
```

## Key Changes

### Before (Flat Structure)

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  externalId: string;
  address: Address | null;
  dateOfBirth: Date | null;
  nextOfKin: NextOfKin | null;
  contactPerson: ContactPerson | null;
  sex: Sex | null;
  encryptedTaxId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### After (Separated Concerns)

```typescript
export interface User {
  // ---- Core Identity & Authentication
  id: string;
  username: string;
  email: string;
  externalId: string;
  roles: Role[];
  permissions: Permission[];
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt: Date | null;
  lastPasswordChangeAt: Date | null;
  mfaEnabled: boolean;

  // ---- Related Entities (Value Objects)
  identity: UserIdentity;
  contact: UserContact;
  address: Address | null;
  preferences: UserPreferences;
  emergencyContacts: UserEmergencyContacts;
  employment: UserEmployment;
  compliance: UserCompliance;
  externalIds: ExternalIds;
  audit: UserAudit;
}
```

## Enums

### Role
- `'admin'` — Administrator
- `'manager'` — Manager
- `'employee'` — Employee
- `'user'` — Regular user

### Permission
- `'read:profile'` — Can read own profile
- `'write:profile'` — Can update own profile
- `'read:transactions'` — Can view transactions
- `'write:transactions'` — Can create transactions
- `'admin:users'` — Can manage users
- `'admin:system'` — Can manage system settings

### MaritalStatus
- `'single'`
- `'married'`
- `'divorced'`
- `'widowed'`
- `'registered-partnership'`
- `'prefer-not-to-say'`

### EmploymentStatus
- `'active'`
- `'inactive'`
- `'on-leave'`
- `'terminated'`

### Theme
- `'light'`
- `'dark'`
- `'system'`

## Usage Examples

### Creating a New User

```typescript
import { buildNewUser } from './domain/user';

const newUser = buildNewUser({
  username: 'john.doe',
  email: 'john@example.com',
  externalId: 'okta-123',
  identity: {
    displayName: 'John Doe',
    middleName: 'Michael',
    preferredName: 'Johnny',
    nationality: 'CA',
    preferredLanguage: 'en',
    maritalStatus: 'married',
    dateOfBirth: '1990-01-15',
    sex: 'male',
  },
  contact: {
    phoneNumber: '+1-403-555-0100',
    mobileNumber: '+1-403-555-0101',
    secondaryEmail: 'john.doe@work.com',
  },
  address: {
    street: '123 Main St',
    city: 'Calgary',
    stateProvince: 'AB',
    country: 'CA',
    postalCode: 'T2P 1M1',
  },
  preferences: {
    timeZone: 'America/Edmonton',
    locale: 'en-CA',
    theme: 'dark',
    notificationPreferences: {
      emailNotifications: true,
      smsNotifications: false,
      inAppNotifications: true,
      marketingEmails: false,
    },
  },
  emergencyContacts: {
    primaryContact: {
      fullName: 'Jane Doe',
      relationship: 'Spouse',
      phone: '+1-403-555-0102',
      email: 'jane@example.com',
    },
  },
  roles: ['user'],
  compliance: {
    termsAcceptedAt: new Date().toISOString(),
    privacyPolicyAcceptedAt: new Date().toISOString(),
    marketingConsent: false,
  },
  employment: {
    employeeNumber: 'EMP-001',
    departmentId: 'dept-sales',
    jobTitle: 'Sales Associate',
    hireDate: '2024-01-15',
    employmentStatus: 'active',
  },
});
```

### Updating a User

```typescript
import { buildUserPatch } from './domain/user';

const patch = buildUserPatch({
  preferences: {
    theme: 'light',
    locale: 'en-US',
  },
  contact: {
    phoneNumber: '+1-403-555-0199',
  },
  employment: {
    jobTitle: 'Senior Sales Associate',
    employmentStatus: 'active',
  },
});
```

### Accessing User Data

```typescript
// Core identity
const userId = user.id;
const role = user.roles[0]; // 'user', 'admin', etc.
const isActive = user.isActive;

// Profile information
const displayName = user.identity.displayName;
const preferredLanguage = user.identity.preferredLanguage;

// Contact information
const primaryPhone = user.contact.phoneNumber;
const email = user.email;

// Preferences
const theme = user.preferences.theme;
const timeZone = user.preferences.timeZone;

// Emergency contacts
const primaryEmergency = user.emergencyContacts.primaryContact;

// Compliance
const taxId = user.compliance.encryptedTaxId;
const consents = user.compliance.termsAcceptedAt;

// Employment
const jobTitle = user.employment.jobTitle;
const dept = user.employment.departmentId;

// Audit
const createdAt = user.audit.createdAt;
const deletedAt = user.audit.deletedAt;
const isDeleted = user.audit.isDeleted;
```

## Backwards Compatibility

Two helper functions provide backwards compatibility with code expecting the old structure:

```typescript
// Convert new User to legacy NextOfKin format
export function userToNextOfKin(user: User): NextOfKin | null;

// Convert new User to legacy ContactPerson format
export function userToContactPerson(user: User): ContactPerson | null;
```

## Migration Notes

### For Repository/Infrastructure Layer

When updating the Prisma schema or database adapters:

1. The relational structure should mirror the entity structure above
2. `User` table contains only core identity and authentication fields
3. Create separate tables or embedded documents for:
   - `UserIdentity` (or columns in User table if using relational DB)
   - `UserContact`
   - `UserPreferences`
   - `UserEmergencyContacts`
   - `UserEmployment`
   - `UserCompliance`
   - `ExternalIds`
   - `UserAudit`
4. Use appropriate normalization:
   - **If using Prisma + SQL:** Break into related models with 1:1 relationships
   - **If using MongoDB:** Embed all objects within a single User document
   - **If using Firebase/Firestore:** Consider a subcollection for large nested objects

### For Use-Cases / Application Layer

Update use-case DTOs to match the new structure:

```typescript
// Before
export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  nextOfKin?: NextOfKinInput;
}

// After
export interface UpdateUserInput {
  identity?: Partial<UserIdentityInput>;
  emergencyContacts?: UserEmergencyContactsInput;
  preferences?: UserPreferencesInput;
}
```

### For API Routes / Controllers

Request/response payloads should expose the nested structure:

```typescript
// Request body
PATCH /api/users/:id
{
  "identity": {
    "displayName": "Jane Doe",
    "maritalStatus": "married"
  },
  "preferences": {
    "theme": "light"
  }
}

// Response
{
  "id": "...",
  "username": "...",
  "email": "...",
  "roles": ["user"],
  "isActive": true,
  "identity": { ... },
  "contact": { ... },
  "preferences": { ... },
  ...
}
```

## Testing

When writing tests, leverage the builder functions:

```typescript
import { buildNewUser, buildUserPatch } from './domain/user';

describe('User Domain', () => {
  it('should build a valid user with all fields', () => {
    const user = buildNewUser({
      username: 'test',
      email: 'test@example.com',
      externalId: 'ext-123',
      identity: { displayName: 'Test User' },
    });
    expect(user.identity.displayName).toBe('Test User');
    expect(user.roles).toEqual(['user']);
    expect(user.compliance.marketingConsent).toBe(false);
  });

  it('should apply patches correctly', () => {
    const patch = buildUserPatch({
      preferences: { theme: 'light' },
    });
    expect(patch.preferences?.theme).toBe('light');
  });
});
```

## Files Changed

- `src/domain/user.ts` — Core User entity (refactored)
- `src/domain/enums.ts` — New: Role, Permission, MaritalStatus, EmploymentStatus, Theme enums
- `src/domain/user-profile.ts` — New: UserIdentity, UserContact, UserPreferences, UserEmergencyContacts
- `src/domain/user-compliance.ts` — New: UserCompliance, UserEmployment, ExternalIds, UserAudit

## Next Steps

1. Update `src/infrastructure/prisma-user.repository.ts` to map between Prisma models and new User structure
2. Update `src/application/dtos/user.dto.ts` to reflect the new structure
3. Update all use-cases to work with the nested structure
4. Update API routes to validate and return the new shape
5. Add integration tests for the refactored domain
