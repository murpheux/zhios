# User Domain Refactor — File Index

## Quick Navigation

This refactor introduces a separated, concern-based User domain architecture. Use this index to find what you need.

---

## 📋 **Documentation Files**

### Start Here
- **[REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md)** ← **READ THIS FIRST**
  - Overview of all changes
  - What's new, what changed, what's breaking
  - Migration phases and checklist
  - Discussion points for team review

### Design & Architecture
- **[USER_DOMAIN_REFACTOR.md](./USER_DOMAIN_REFACTOR.md)**
  - Detailed architecture with visual diagrams
  - Explanation of each value object
  - Migration notes for each layer
  - Backwards compatibility guidance

- **[USER_ARCHITECTURE_DIAGRAM.md](./USER_ARCHITECTURE_DIAGRAM.md)**
  - Entity relationship diagrams (ASCII art)
  - Layer architecture (API → Application → Domain → Infrastructure)
  - Data flow diagrams for create/update
  - Design principles and testing strategy

### Quick Reference
- **[USER_REFACTOR_QUICK_REFERENCE.md](./USER_REFACTOR_QUICK_REFERENCE.md)**
  - One-pager: before/after comparison
  - Import changes
  - Field mapping guide
  - Common scenarios with code examples
  - Troubleshooting table

### API Examples
- **[USER_API_EXAMPLES.md](./USER_API_EXAMPLES.md)**
  - REST API request/response examples
  - Create user with all fields
  - Partial update examples
  - Get user with full details
  - Error response formats
  - Field constraints table
  - Rate limits and response headers

---

## 🔧 **Source Code Files**

### New Files (Created)

#### Enums & Validators
- **[src/domain/enums.ts](../src/domain/enums.ts)** (2 KB)
  - `Role` enum: admin, manager, employee, user
  - `Permission` enum: read/write/admin permissions
  - `MaritalStatus` enum: single, married, divorced, etc.
  - `EmploymentStatus` enum: active, inactive, on-leave, terminated
  - `Theme` enum: light, dark, system
  - Validator functions for each enum

#### Value Objects & Builders
- **[src/domain/user-profile.ts](../src/domain/user-profile.ts)** (6.4 KB)
  - `UserIdentity`: displayName, middleName, preferredName, dateOfBirth, maritalStatus, etc.
  - `UserContact`: phoneNumber, mobileNumber, secondaryEmail
  - `UserPreferences`: theme, timeZone, locale, notificationPreferences
  - `UserEmergencyContacts`: primaryContact, secondaryContact, nextOfKin (legacy)
  - Builder functions: buildUserIdentity(), buildUserContact(), buildUserPreferences(), buildUserEmergencyContacts()

- **[src/domain/user-compliance.ts](../src/domain/user-compliance.ts)** (4 KB)
  - `UserCompliance`: encryptedTaxId, termsAcceptedAt, privacyPolicyAcceptedAt, marketingConsent
  - `UserEmployment`: employeeNumber, departmentId, jobTitle, managerId, hireDate, employmentStatus
  - `ExternalIds`: okta, azureAd, google, employeeSystem
  - `UserAudit`: createdBy, updatedBy, deletedAt, deactivatedAt, isDeleted, createdAt, updatedAt
  - Builder functions: buildUserCompliance(), buildUserEmployment(), buildExternalIds(), buildUserAudit()

### Modified Files

- **[src/domain/user.ts](../src/domain/user.ts)** (7.6 KB)
  - **Refactored:** Flat User → Nested User with value objects
  - Core fields: id, username, email, externalId
  - Auth fields: roles, permissions, isActive, emailVerified, phoneVerified, lastLoginAt, lastPasswordChangeAt, mfaEnabled
  - Related entities: identity, contact, address, preferences, emergencyContacts, employment, compliance, externalIds, audit
  - Updated builders: buildNewUser(), buildUserPatch()
  - Backwards compatibility: userToNextOfKin(), userToContactPerson()

- **[src/domain/index.ts](../src/domain/index.ts)** (469 B)
  - **Updated:** Added exports for enums, user-profile, user-compliance
  - Re-exports commonly used types

---

## 📊 **Architecture Overview**

```
User Aggregate Root
├── Identity & Authentication (Core)
│   ├── id, username, email, externalId
│   ├── roles, permissions
│   └── Auth state: isActive, emailVerified, phoneVerified, lastLoginAt, mfaEnabled
│
├── UserIdentity (Value Object)
│   └── displayName, maritalStatus, dateOfBirth, nationality, etc.
│
├── UserContact (Value Object)
│   └── phoneNumber, mobileNumber, secondaryEmail
│
├── Address (Value Object) [Existing]
│   └── street, city, stateProvince, postalCode
│
├── UserPreferences (Value Object)
│   └── theme, timeZone, locale, notificationPreferences
│
├── UserEmergencyContacts (Value Object)
│   └── primaryContact, secondaryContact, nextOfKin (legacy)
│
├── UserCompliance (Value Object)
│   └── encryptedTaxId, termsAcceptedAt, privacyPolicyAcceptedAt, marketingConsent
│
├── UserEmployment (Value Object)
│   └── employeeNumber, departmentId, jobTitle, managerId, hireDate, employmentStatus
│
├── ExternalIds (Value Object)
│   └── okta, azureAd, google, employeeSystem
│
└── UserAudit (Value Object)
    └── createdBy, updatedBy, deletedAt, deactivatedAt, isDeleted, createdAt, updatedAt
```

---

## 🚀 **Getting Started**

### 1. Understand the Design
Read in this order:
1. [REFACTOR_SUMMARY.md](./REFACTOR_SUMMARY.md) — High-level overview
2. [USER_DOMAIN_REFACTOR.md](./USER_DOMAIN_REFACTOR.md) — Detailed architecture
3. [USER_ARCHITECTURE_DIAGRAM.md](./USER_ARCHITECTURE_DIAGRAM.md) — Visual diagrams

### 2. See Examples
- [USER_REFACTOR_QUICK_REFERENCE.md](./USER_REFACTOR_QUICK_REFERENCE.md) — Code examples
- [USER_API_EXAMPLES.md](./USER_API_EXAMPLES.md) — REST API examples

### 3. Review Source Code
1. [src/domain/enums.ts](../src/domain/enums.ts) — Enums and validators
2. [src/domain/user-profile.ts](../src/domain/user-profile.ts) — Profile value objects
3. [src/domain/user-compliance.ts](../src/domain/user-compliance.ts) — Compliance value objects
4. [src/domain/user.ts](../src/domain/user.ts) — Core User entity

### 4. Implement Next Phases
Follow the [Migration Path](./REFACTOR_SUMMARY.md#migration-path) in REFACTOR_SUMMARY.md:
- **Phase 2:** Update `src/infrastructure/prisma-user.repository.ts`
- **Phase 3:** Update `src/application/dtos/user.dto.ts` and use-cases
- **Phase 4:** Update API routes
- **Phase 5:** Update tests
- **Phase 6:** Deploy

---

## 📖 **Reference Tables**

### New Enums

| Enum | Values | Use Case |
|---|---|---|
| `Role` | admin, manager, employee, user | RBAC |
| `Permission` | read:profile, write:profile, read:transactions, write:transactions, admin:users, admin:system | Fine-grained access control |
| `MaritalStatus` | single, married, divorced, widowed, registered-partnership, prefer-not-to-say | Demographics |
| `EmploymentStatus` | active, inactive, on-leave, terminated | HR tracking |
| `Theme` | light, dark, system | UI preferences |

### Key Field Mapping (Old → New)

| Old Field | New Field | Notes |
|---|---|---|
| `firstName` | `identity.displayName` | Combine first/middle/last → displayName |
| `lastName` | `identity.displayName` | — |
| `dateOfBirth` | `identity.dateOfBirth` | Moved to identity |
| `sex` | `identity.sex` | Moved to identity |
| `address` | `address` | **Unchanged** |
| `nextOfKin` | `emergencyContacts.primaryContact` or `emergencyContacts.nextOfKin` | Can use primary or legacy |
| `contactPerson` | `emergencyContacts.primaryContact` | — |
| `encryptedTaxId` | `compliance.encryptedTaxId` | Moved to compliance |
| `createdAt` | `audit.createdAt` | Moved to audit |
| `updatedAt` | `audit.updatedAt` | Moved to audit |
| *(new)* | `roles` | ✅ **New field** |
| *(new)* | `permissions` | ✅ **New field** |
| *(new)* | `isActive` | ✅ **New field** |
| *(new)* | `emailVerified` | ✅ **New field** |
| *(new)* | `phoneVerified` | ✅ **New field** |

### Builder Functions

| Function | Input Type | Output Type | Use Case |
|---|---|---|---|
| `buildNewUser()` | `NewUserInput` | `NewUser` | Create new user (no id) |
| `buildUserPatch()` | `UserPatchInput` | `UserPatch` | Partial update |
| `buildUserIdentity()` | `UserIdentityInput` | `UserIdentity` | Build identity object |
| `buildUserContact()` | `UserContactInput` | `UserContact` | Build contact object |
| `buildUserPreferences()` | `UserPreferencesInput` | `UserPreferences` | Build preferences object |
| `buildUserEmergencyContacts()` | `UserEmergencyContactsInput` | `UserEmergencyContacts` | Build emergency contacts |
| `buildUserCompliance()` | `UserComplianceInput` | `UserCompliance` | Build compliance object |
| `buildUserEmployment()` | `UserEmploymentInput` | `UserEmployment` | Build employment object |
| `buildExternalIds()` | `ExternalIdsInput` | `ExternalIds` | Build external IDs |
| `buildUserAudit()` | *(optional override)* | `UserAudit` | Build audit object |

---

## 🔗 **Related Files (To Update Later)**

### Phase 2 — Infrastructure
- [ ] `src/infrastructure/prisma-user.repository.ts` — Database adapter
- [ ] `prisma/schema.prisma` — (optional) Update schema if needed

### Phase 3 — Application
- [ ] `src/application/dtos/user.dto.ts` — API DTOs
- [ ] `src/application/use-cases/create-user.use-case.ts`
- [ ] `src/application/use-cases/update-user.use-case.ts`
- [ ] `src/application/use-cases/get-user.use-case.ts`

### Phase 4 — API
- [ ] `src/api/routes/users.routes.ts` — REST endpoints
- [ ] `src/api/schemas/user.schema.ts` — JSON Schema validation

### Phase 5 — Testing
- [ ] `tests/unit/user.use-cases.test.ts` — Update existing tests
- [ ] Add tests for new enums and builders

---

## 📝 **Validation & Testing Checklist**

- [ ] Domain files compile: `npm run build`
- [ ] Enums work correctly
- [ ] Builders enforce invariants
- [ ] Backwards compatibility helpers work
- [ ] Documentation is complete and clear
- [ ] Team has reviewed and approved design
- [ ] Proceed to Phase 2 implementation

---

## ❓ **FAQ**

**Q: Should I update code now or wait?**
A: The domain files are ready to use. Update other layers in the [Migration Path](./REFACTOR_SUMMARY.md#migration-path) phases.

**Q: How do I access nested fields?**
A: See [USER_REFACTOR_QUICK_REFERENCE.md](./USER_REFACTOR_QUICK_REFERENCE.md#accessing-fields) for field access examples.

**Q: What about existing databases?**
A: See [Phase 2](./REFACTOR_SUMMARY.md#phase-2-infrastructure-layer-todo) for repository adapter updates.

**Q: Is this backwards compatible?**
A: Partially. Use `userToNextOfKin()` and `userToContactPerson()` helpers for legacy code during transition.

**Q: Where are the tests?**
A: Add tests in [Phase 5](./REFACTOR_SUMMARY.md#phase-5-testing-todo) following the [Testing Strategy](./USER_ARCHITECTURE_DIAGRAM.md#testing-strategy).

---

## 📞 **Questions or Issues?**

Refer to the relevant section:
- **Architecture questions:** [USER_ARCHITECTURE_DIAGRAM.md](./USER_ARCHITECTURE_DIAGRAM.md)
- **Migration questions:** [USER_DOMAIN_REFACTOR.md](./USER_DOMAIN_REFACTOR.md#migration-notes)
- **API design:** [USER_API_EXAMPLES.md](./USER_API_EXAMPLES.md)
- **Quick answers:** [USER_REFACTOR_QUICK_REFERENCE.md](./USER_REFACTOR_QUICK_REFERENCE.md)

---

**Refactor Date:** 2026-11-14  
**Status:** Phase 1 (Domain Layer) ✅ Complete  
**Next:** Phase 2 (Infrastructure Layer)
