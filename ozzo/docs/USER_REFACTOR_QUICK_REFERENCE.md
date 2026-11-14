# User Refactor — Quick Reference

## One-Pager: Old vs New

### Structure Comparison

| Aspect | Before | After |
|---|---|---|
| **Core fields** | Flat (firstName, lastName, dateOfBirth, sex, nextOfKin, etc.) | Nested (identity, contact, preferences, etc.) |
| **Auth fields** | None (just roles implicit) | Explicit (roles, permissions, isActive, emailVerified, etc.) |
| **Audit** | Only createdAt/updatedAt | Full audit trail (createdBy, updatedBy, deletedAt, isDeleted) |
| **External IDs** | externalId only | externalIds object (okta, azureAd, google, employeeSystem) |
| **Emergency contact** | Single nextOfKin/contactPerson | Multiple (primaryContact, secondaryContact, plus legacy nextOfKin) |
| **Employment** | None | Full object (employeeNumber, department, jobTitle, hireDate, status) |
| **Preferences** | None | Full object (theme, timeZone, locale, notifications) |
| **Compliance** | Only encryptedTaxId | Full object (taxId, consents, marketing opt-in, timestamps) |

### Import Changes

**Before:**
```typescript
import { User, buildNewUser, buildUserPatch, NextOfKin, ContactPerson } from './domain/user';
```

**After:**
```typescript
import {
  User,
  buildNewUser,
  buildUserPatch,
  type Role,
  type UserIdentity,
  type UserPreferences,
  // ... and more
} from './domain';
```

### Creating a User

**Before:**
```typescript
const newUser = buildNewUser({
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  externalId: 'okta-123',
  dateOfBirth: '1992-03-15',
  sex: 'female',
  address: { street: '123 Main', ... },
  nextOfKin: { fullName: 'Bob', ... },
  encryptedTaxId: 'xyz789',
});
```

**After:**
```typescript
const newUser = buildNewUser({
  username: 'alice',
  email: 'alice@example.com',
  externalId: 'okta-123',
  roles: ['user'],
  identity: {
    displayName: 'Alice Smith',
    dateOfBirth: '1992-03-15',
    sex: 'female',
  },
  address: { street: '123 Main', ... },
  emergencyContacts: {
    primaryContact: { fullName: 'Bob', ... },
  },
  compliance: {
    encryptedTaxId: 'xyz789',
  },
});
```

### Accessing Fields

**Before:**
```typescript
user.firstName         // "Alice"
user.dateOfBirth       // Date
user.sex               // "female"
user.nextOfKin?.phone  // "555-0100"
user.encryptedTaxId    // "xyz789"
user.createdAt         // Date
user.updatedAt         // Date
```

**After:**
```typescript
user.identity.displayName      // "Alice Smith"
user.identity.dateOfBirth      // Date
user.identity.sex              // "female"
user.emergencyContacts.primaryContact?.phone  // "555-0100"
user.compliance.encryptedTaxId // "xyz789"
user.audit.createdAt           // Date
user.audit.updatedAt           // Date
user.roles                     // ["user"]
user.isActive                  // true
user.lastLoginAt               // Date | null
```

### New Enums

```typescript
type Role = 'admin' | 'manager' | 'employee' | 'user';
type Permission = 'read:profile' | 'write:profile' | 'read:transactions' | 'write:transactions' | 'admin:users' | 'admin:system';
type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'registered-partnership' | 'prefer-not-to-say';
type EmploymentStatus = 'active' | 'inactive' | 'on-leave' | 'terminated';
type Theme = 'light' | 'dark' | 'system';
```

## File Map

| File | Purpose | Contains |
|---|---|---|
| `src/domain/enums.ts` | **NEW** | Role, Permission, MaritalStatus, EmploymentStatus, Theme + validators |
| `src/domain/user-profile.ts` | **NEW** | UserIdentity, UserContact, UserPreferences, UserEmergencyContacts + builders |
| `src/domain/user-compliance.ts` | **NEW** | UserCompliance, UserEmployment, ExternalIds, UserAudit + builders |
| `src/domain/user.ts` | **REFACTORED** | Core User entity, NewUserInput, UserPatchInput, buildNewUser, buildUserPatch |
| `src/domain/index.ts` | **UPDATED** | Re-exports all domain types |

## Common Scenarios

### Scenario 1: User Login Updates

**Before:**
```typescript
const patch = buildUserPatch({
  lastLoginAt: new Date(),
});
```

**After:**
```typescript
// lastLoginAt is NOT in UserPatch (read-only in entity)
// Update via repository/use-case directly
user.audit.lastLoginAt = new Date();  // or in persistence layer
```

**Better Approach:** Use-case should handle auth updates separately.

### Scenario 2: Admin Bulk-Assigns Department

**Before:**
```typescript
// No employment support
```

**After:**
```typescript
const patch = buildUserPatch({
  employment: {
    departmentId: 'dept-sales',
    jobTitle: 'Sales Lead',
  },
});
```

### Scenario 3: User Updates Preferences

**Before:**
```typescript
// No preferences support
```

**After:**
```typescript
const patch = buildUserPatch({
  preferences: {
    theme: 'light',
    timeZone: 'America/New_York',
    notificationPreferences: {
      emailNotifications: false,
    },
  },
});
```

### Scenario 4: Soft-Delete User

**Before:**
```typescript
const patch = buildUserPatch({});
// No deletion support; must add deletedAt manually
```

**After:**
```typescript
// In repository/use-case:
user.audit.isDeleted = true;
user.audit.deletedAt = new Date();
// or via a dedicated method: repository.softDelete(userId)
```

### Scenario 5: Check User Permissions

**Before:**
```typescript
// No permission support
```

**After:**
```typescript
if (user.roles.includes('admin') || user.permissions.includes('admin:users')) {
  // Allow user management
}
```

## Backwards Compatibility

Two helper functions provide legacy support:

```typescript
// Convert new User to old NextOfKin format
userToNextOfKin(user) // → NextOfKin | null

// Convert new User to old ContactPerson format
userToContactPerson(user) // → ContactPerson | null
```

Use these in adapters/repositories when returning legacy DTO shapes.

## Migration Checklist

- [ ] Update `src/infrastructure/prisma-user.repository.ts` (map new fields)
- [ ] Update `src/application/dtos/user.dto.ts` (API shapes)
- [ ] Update all user-related use-cases (buildNewUser, buildUserPatch signatures)
- [ ] Update API routes to validate new structure (request body schemas)
- [ ] Add tests for enums and builders
- [ ] Update integration tests with mongodb-memory-server
- [ ] Run `npm test` to verify all tests still pass
- [ ] Manual testing of user CRUD endpoints
- [ ] Update Postman collection
- [ ] Document API changes in OpenAPI spec

## Potential Issues & Solutions

| Issue | Solution |
|---|---|
| `Cannot read property 'firstName' of undefined` | Use `user.identity.displayName` instead |
| `role is not a valid enum` | Ensure role is validated with `assertRole(role)` |
| `Type error: roles is not an array` | Ensure `roles` is always an array (default: `['user']`) |
| Repository returns old shape | Update repository adapter to return new User structure |
| DTO validation fails | Update API route schemas to match new structure |
| Tests expect flat User | Update test fixtures to use new structure or helpers |
| Circular dependency in validators | Check imports in `value-objects.ts`, ensure no cycles |

## Performance Notes

- **Flatter queries:** If using relational DB, consider denormalizing frequently-accessed fields (displayName, email, isActive) to User table
- **Indexing:** Ensure indexes on `(email, isActive)` and `(externalId)` for quick lookups
- **Embedding in MongoDB:** Embed all sub-objects within User document for atomicity
- **Lazy loading:** For large nested objects, consider lazy-loading employment/compliance in separate query if not always needed

## Validation Rules Summary

| Field | Rule | Example |
|---|---|---|
| `username` | Regex: `^[a-zA-Z0-9._-]{3,32}$` | ✅ `alice.smith` |
| `email` | Regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`, max 254 | ✅ `alice@example.com` |
| `externalId` | Non-empty string, trimmed | ✅ `okta-user-456` |
| `displayName` | 1–100 chars | ✅ `Alice Smith` |
| `phoneNumber` | E.164 or regional pattern | ✅ `+1-404-555-0100` |
| `dateOfBirth` | `YYYY-MM-DD`, past date, ≥ 1900 | ✅ `1992-03-15` |
| `roles` | Array of valid Role enums | ✅ `['user', 'employee']` |
| `theme` | One of `'light'`, `'dark'`, `'system'` | ✅ `'dark'` |
| `address.country` | One of `'US'`, `'CA'`, `'UK'` | ✅ `'CA'` |

## Next Steps

1. **Review this refactor** with the team
2. **Update repository adapters** to map old DB schema to new structure
3. **Update API schemas** (validation, serialization)
4. **Run full test suite** to catch integration issues
5. **Deploy to staging** and do end-to-end testing
6. **Update client libraries** (api-client package) to use new shapes
