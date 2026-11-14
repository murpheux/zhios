# User Domain Refactor — Summary

## Overview

The User domain in ozzo has been redesigned to separate concerns and improve maintainability. The core `User` entity is now focused on **identity and authentication**, with related data organized into separate value objects (UserIdentity, UserContact, UserPreferences, UserCompliance, UserEmployment, UserAudit, ExternalIds).

## What Changed

### Files Created (4 new files)

| File | Purpose |
|---|---|
| `src/domain/enums.ts` | Role, Permission, MaritalStatus, EmploymentStatus, Theme enums with validators |
| `src/domain/user-profile.ts` | UserIdentity, UserContact, UserPreferences, UserEmergencyContacts value objects + builders |
| `src/domain/user-compliance.ts` | UserCompliance, UserEmployment, ExternalIds, UserAudit value objects + builders |
| `docs/USER_DOMAIN_REFACTOR.md` | Detailed refactor guide with architecture, usage, and migration notes |

### Files Modified (2 updated files)

| File | Changes |
|---|---|
| `src/domain/user.ts` | Complete refactor: flat structure → nested entities |
| `src/domain/index.ts` | Added exports for enums, user-profile, user-compliance |

### Documentation Created (3 guides)

| File | Purpose |
|---|---|
| `docs/USER_REFACTOR_QUICK_REFERENCE.md` | One-pager with before/after examples, checklist, common scenarios |
| `docs/USER_API_EXAMPLES.md` | Request/response examples for REST API endpoints |
| `docs/USER_ARCHITECTURE_DIAGRAM.md` | Visual diagrams, data flows, layer architecture |

**Total:** 9 files — 4 new domain files, 2 updated, 3 documentation guides.

## Key Improvements

### 1. Better Organization

**Before:** Flat, 13 fields in User
```typescript
interface User {
  id, username, email, firstName, lastName, externalId,
  address, dateOfBirth, nextOfKin, contactPerson, sex,
  encryptedTaxId, createdAt, updatedAt
}
```

**After:** Organized by concern, 8 nested objects
```typescript
interface User {
  // Core identity & auth (12 fields)
  id, username, email, externalId, roles, permissions,
  isActive, emailVerified, phoneVerified,
  lastLoginAt, lastPasswordChangeAt, mfaEnabled
  
  // Related entities (8 objects)
  identity, contact, address, preferences,
  emergencyContacts, employment, compliance, externalIds, audit
}
```

### 2. New Capabilities

**Added:**
- ✅ Roles & permissions (RBAC ready)
- ✅ Full auth state tracking (emailVerified, phoneVerified, lastLoginAt, mfaEnabled)
- ✅ Employment data (department, jobTitle, hireDate, employmentStatus)
- ✅ User preferences (theme, timeZone, locale, notifications)
- ✅ Compliance tracking (consents, marketing opt-in with timestamps)
- ✅ Multiple emergency contacts (primary, secondary, plus legacy nextOfKin)
- ✅ External integrations (Okta, Azure AD, Google, employee system)
- ✅ Full audit trail (createdBy, updatedBy, deletedAt, deactivatedAt, isDeleted)
- ✅ Demographics (maritalStatus, nationality, preferredLanguage)

### 3. Type Safety

**Added:**
```typescript
type Role = 'admin' | 'manager' | 'employee' | 'user'
type Permission = 'read:profile' | 'write:profile' | ...
type MaritalStatus = 'single' | 'married' | ...
type EmploymentStatus = 'active' | 'inactive' | ...
type Theme = 'light' | 'dark' | 'system'
```

### 4. Validation & Normalization

All builders enforce invariants:
- ✅ Enum assertions (roles, permissions, maritalStatus, theme)
- ✅ Phone number validation (E.164 and regional formats)
- ✅ Email validation (RFC 5322)
- ✅ Date validation (YYYY-MM-DD, future date rejection)
- ✅ Username validation (3-32 chars, alphanumeric + `._-`)
- ✅ Name validation (1-100 chars)

## Usage Changes

### Creating a User

**Before:**
```typescript
const user = buildNewUser({
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  externalId: 'okta-123',
  dateOfBirth: '1992-03-15',
  sex: 'female',
});
```

**After:**
```typescript
const user = buildNewUser({
  username: 'alice',
  email: 'alice@example.com',
  externalId: 'okta-123',
  roles: ['user'],
  identity: {
    displayName: 'Alice Smith',
    dateOfBirth: '1992-03-15',
    sex: 'female',
  },
  preferences: {
    theme: 'dark',
    timeZone: 'America/New_York',
  },
});
```

### Accessing Fields

**Before:**
```typescript
user.firstName    // "Alice"
user.dateOfBirth  // Date
user.nextOfKin    // { fullName, relationship, phone?, email? }
```

**After:**
```typescript
user.identity.displayName       // "Alice Smith"
user.identity.dateOfBirth       // Date
user.emergencyContacts.primaryContact?.fullName
user.roles                      // ["user"]
user.isActive                   // true
user.preferences.theme          // "dark"
```

## Breaking Changes

**These changes require updates to code using User:**

1. **Field restructuring:** Replace flat access with nested object access
   ```
   user.firstName → user.identity.displayName (or combine firstName/lastName to displayName)
   user.dateOfBirth → user.identity.dateOfBirth
   user.sex → user.identity.sex
   user.address → user.address (unchanged)
   user.nextOfKin → user.emergencyContacts.primaryContact or user.emergencyContacts.nextOfKin
   user.contactPerson → user.emergencyContacts.primaryContact
   user.encryptedTaxId → user.compliance.encryptedTaxId
   user.createdAt → user.audit.createdAt
   user.updatedAt → user.audit.updatedAt
   ```

2. **New required fields:** All new User creations must include
   ```
   identity (required)
   roles (defaults to ['user'])
   ```

3. **Enum-based role/permission checking:**
   ```
   Before: No roles field
   After: user.roles.includes('admin') or user.permissions.includes('admin:users')
   ```

4. **Use `buildNewUser()` and `buildUserPatch()` instead of manual object creation**

## Migration Path

### Phase 1: Domain Layer (Complete)
- ✅ Created enums.ts, user-profile.ts, user-compliance.ts
- ✅ Refactored user.ts to new structure
- ✅ Updated domain/index.ts exports
- ✅ Created comprehensive documentation

### Phase 2: Infrastructure Layer (TODO)
- Update `src/infrastructure/prisma-user.repository.ts`
  - Map new nested User structure to/from Prisma models
  - Handle address history (User.address → addresses[])
  - Persist roles, permissions, audit fields
- Update Prisma schema if needed
  - Consider whether to normalize (separate tables) or embed (JSON fields)
  - Add indexes for quick lookups (email, externalId)

### Phase 3: Application Layer (TODO)
- Update `src/application/dtos/user.dto.ts`
  - Reflect new nested structure
  - Add validation schemas for each nested object
- Update all use-cases
  - CreateUserUseCase: use buildNewUser()
  - UpdateUserUseCase: use buildUserPatch()
  - GetUserUseCase: return full User with all objects
- Update error handling to reference nested paths

### Phase 4: API Layer (TODO)
- Update API routes to:
  - Validate nested request bodies
  - Return nested response structures
  - Handle partial updates correctly
- Update Postman collection with new request/response shapes
- Update OpenAPI spec with new schema definitions

### Phase 5: Testing (TODO)
- Update/add unit tests for new enums and builders
- Update integration tests with mongodb-memory-server
- Update E2E tests for user CRUD endpoints
- Run `npm test` to verify all tests pass

### Phase 6: Deployment (TODO)
- Deploy to staging, perform end-to-end testing
- Update client libraries (api-client package)
- Document changes in CHANGELOG.md
- Deploy to production

## Backwards Compatibility

Two helper functions bridge the gap for legacy code:

```typescript
// Convert new User to old NextOfKin format
userToNextOfKin(user) → NextOfKin | null

// Convert new User to old ContactPerson format
userToContactPerson(user) → ContactPerson | null
```

Use these in adapters when returning legacy DTO shapes during transition period.

## Files to Review

1. **Domain Layer** (review first)
   - `src/domain/enums.ts` — New enums and validators
   - `src/domain/user-profile.ts` — New value objects for profile
   - `src/domain/user-compliance.ts` — New value objects for compliance/employment
   - `src/domain/user.ts` — Refactored core User entity

2. **Documentation** (reference during implementation)
   - `docs/USER_DOMAIN_REFACTOR.md` — Detailed guide
   - `docs/USER_REFACTOR_QUICK_REFERENCE.md` — Quick lookup
   - `docs/USER_API_EXAMPLES.md` — Request/response examples
   - `docs/USER_ARCHITECTURE_DIAGRAM.md` — Visual architecture

## Validation Checklist

Before proceeding to Phase 2:

- [ ] Domain layer compiles without errors (`npm run build`)
- [ ] Enum validators work correctly
- [ ] Builder functions enforce invariants
- [ ] Type definitions are correct
- [ ] Backwards compatibility helpers work
- [ ] Documentation is clear and complete
- [ ] Team has reviewed and approved design

## Questions / Discussion Points

1. **Database schema:** Should we normalize (separate tables for each object) or embed (nested JSON/BSON)?
   - **SQL/Prisma:** Likely normalization with 1:1 relationships
   - **MongoDB:** Likely embedding for atomic updates

2. **Soft-delete implementation:** How should `isDeleted`, `deletedAt`, `deactivatedAt` be persisted?
   - Option A: Physical columns in User table
   - Option B: Soft-delete middleware in repository
   - **Recommendation:** Option A for explicit audit trail

3. **First/Last Name to DisplayName:** How should we handle existing records?
   - Option A: Concatenate firstName + lastName → displayName on migration
   - Option B: Keep firstName/lastName separately during transition
   - **Recommendation:** Option A with migration script

4. **Address History:** Current design has single `address`. Should we support multiple addresses with types (home, work, billing)?
   - Current: One address per user
   - Enhanced: `addresses: Address[]` with type field
   - **Recommendation:** Stay with single address for MVP, enhance later if needed

5. **Permissions model:** Should we add a `groups` concept (e.g., 'admin_group' grants multiple permissions)?
   - Current: Direct permission array
   - Enhanced: Groups + inherited permissions
   - **Recommendation:** Direct permissions for MVP, groups later if needed

## Next Steps

1. Review this refactor with the team
2. Address the questions/discussion points above
3. Get approval to proceed with Phase 2
4. Update the repository adapter (`prisma-user.repository.ts`)
5. Update application layer and API routes
6. Run full test suite
7. Deploy to staging for E2E testing

---

**Refactor Date:** 2026-11-14
**Status:** Phase 1 (Domain Layer) Complete ✅
**Next Phase:** Phase 2 (Infrastructure Layer)
