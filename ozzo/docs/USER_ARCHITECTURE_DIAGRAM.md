# User Domain Architecture Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            USER AGGREGATE                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ User (Root Entity)                                               │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ • id: string                                                     │   │
│  │ • username: string                                               │   │
│  │ • email: string                                                  │   │
│  │ • externalId: string                                             │   │
│  │ • roles: Role[]                                                  │   │
│  │ • permissions: Permission[]                                      │   │
│  │ • isActive: boolean                                              │   │
│  │ • emailVerified: boolean                                         │   │
│  │ • phoneVerified: boolean                                         │   │
│  │ • lastLoginAt: Date | null                                       │   │
│  │ • lastPasswordChangeAt: Date | null                              │   │
│  │ • mfaEnabled: boolean                                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                   │                                      │
│                   ┌───────────────┼───────────────┐                      │
│                   │               │               │                      │
│                   ▼               ▼               ▼                      │
│  ┌────────────────────────┐ ┌──────────────┐ ┌──────────────┐          │
│  │ UserIdentity           │ │ UserContact  │ │ Address      │          │
│  ├────────────────────────┤ ├──────────────┤ ├──────────────┤          │
│  │ • middleName           │ │ • phone      │ │ • street     │          │
│  │ • preferredName        │ │ • mobile     │ │ • city       │          │
│  │ • displayName          │ │ • secondary  │ │ • state      │          │
│  │ • profilePhotoUrl      │ │              │ │ • country    │          │
│  │ • nationality          │ │              │ │ • postalCode │          │
│  │ • preferredLanguage    │ │              │ │              │          │
│  │ • maritalStatus        │ │              │ │              │          │
│  │ • dateOfBirth          │ │              │ │              │          │
│  │ • sex                  │ │              │ │              │          │
│  └────────────────────────┘ └──────────────┘ └──────────────┘          │
│                   │                                                      │
│                   ▼                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ UserPreferences                                                │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │ • timeZone: string | null                                      │   │
│  │ • locale: string | null                                        │   │
│  │ • theme: 'light' | 'dark' | 'system'                          │   │
│  │ • notificationPreferences:                                     │   │
│  │   ├─ emailNotifications: boolean                               │   │
│  │   ├─ smsNotifications: boolean                                 │   │
│  │   ├─ inAppNotifications: boolean                               │   │
│  │   └─ marketingEmails: boolean                                  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                   │                                                      │
│                   ▼                                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ UserEmergencyContacts                                          │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │ • primaryContact:                                              │   │
│  │   ├─ fullName, relationship, phone, email                     │   │
│  │ • secondaryContact:                                            │   │
│  │   ├─ fullName, relationship, phone, email                     │   │
│  │ • nextOfKin (legacy):                                          │   │
│  │   ├─ fullName, relationship, phone, email                     │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                   │                                                      │
│                   ▼                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                    │
│  │ UserCompliance       │  │ UserEmployment       │                    │
│  ├──────────────────────┤  ├──────────────────────┤                    │
│  │ • encryptedTaxId     │  │ • employeeNumber     │                    │
│  │ • termsAcceptedAt    │  │ • departmentId       │                    │
│  │ • privacyAcceptedAt  │  │ • jobTitle           │                    │
│  │ • marketingConsent   │  │ • managerId          │                    │
│  │ • consentUpdatedAt   │  │ • hireDate           │                    │
│  │                      │  │ • employmentStatus   │                    │
│  └──────────────────────┘  └──────────────────────┘                    │
│                   │                  │                                  │
│                   ▼                  ▼                                  │
│  ┌──────────────────────┐  ┌──────────────────────┐                    │
│  │ ExternalIds          │  │ UserAudit            │                    │
│  ├──────────────────────┤  ├──────────────────────┤                    │
│  │ • okta               │  │ • createdBy          │                    │
│  │ • azureAd            │  │ • updatedBy          │                    │
│  │ • google             │  │ • deletedAt          │                    │
│  │ • employeeSystem     │  │ • deactivatedAt      │                    │
│  │                      │  │ • isDeleted          │                    │
│  │                      │  │ • createdAt          │                    │
│  │                      │  │ • updatedAt          │                    │
│  └──────────────────────┘  └──────────────────────┘                    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Layer Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        API / ROUTES LAYER                        │
│  POST /users  |  GET /users/:id  |  PATCH /users/:id             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    APPLICATION / USE-CASES LAYER                 │
│  CreateUserUseCase  |  UpdateUserUseCase  |  GetUserUseCase      │
│                                                                   │
│  Orchestrates domain logic, validates inputs, manages            │
│  dependencies (repositories, external services)                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                   DOMAIN / ENTITIES LAYER                         │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ User (Aggregate Root)                                       │  │
│  │  └─ buildNewUser(input: NewUserInput): NewUser             │  │
│  │  └─ buildUserPatch(input: UserPatchInput): UserPatch       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  Value Objects & Builders:                                        │
│  • UserIdentity, buildUserIdentity(...)                           │
│  • UserContact, buildUserContact(...)                             │
│  • UserPreferences, buildUserPreferences(...)                     │
│  • UserEmergencyContacts, buildUserEmergencyContacts(...)         │
│  • UserCompliance, buildUserCompliance(...)                       │
│  • UserEmployment, buildUserEmployment(...)                       │
│  • ExternalIds, buildExternalIds(...)                             │
│  • UserAudit, buildUserAudit(...)                                 │
│  • Address, buildAddress(...)                                     │
│                                                                    │
│  Enums & Validators:                                              │
│  • Role, assertRole(...)                                          │
│  • Permission, assertPermission(...)                              │
│  • MaritalStatus, assertMaritalStatus(...)                        │
│  • EmploymentStatus, assertEmploymentStatus(...)                  │
│  • Theme, assertTheme(...)                                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴─────────────────────────────────────┐
│             INFRASTRUCTURE / PERSISTENCE LAYER                   │
│  PrismaUserRepository  |  UserMapper                              │
│                                                                   │
│  • Maps User entity ↔ Database (Prisma model / MongoDB doc)      │
│  • Implements persistence logic                                  │
│  • Handles transactions, soft-deletes                            │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow: Create User

```
Client Request
     │
     ▼
┌─────────────────────┐
│  API Route Handler  │  Validates request body against JSON Schema
└────────────┬────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  NewUserInput (from request body)       │  DTO shape
└────────────┬────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│  CreateUserUseCase.execute(input: NewUserInput)      │
│  ├─ Calls: buildNewUser(input)                       │
│  │  ├─ Validates all fields                          │
│  │  ├─ Normalizes strings (trim, lowercase)          │
│  │  ├─ Asserts enums (roles, permissions)            │
│  │  └─ Returns NewUser (domain entity, no id)        │
│  │                                                    │
│  ├─ Calls: userRepository.create(newUser)            │
│  │  ├─ Generates id                                  │
│  │  ├─ Sets audit.createdAt, audit.createdBy         │
│  │  ├─ Maps User → Prisma model                      │
│  │  ├─ Saves to database                             │
│  │  └─ Maps Prisma model → User                      │
│  │                                                    │
│  └─ Returns: Promise<User>                           │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  User (domain entity with id)           │  Fully hydrated
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  UserDTO (response mapping)             │  API response shape
│  (may redact fields like encryptedTaxId)│
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  201 Created Response (JSON)            │  HTTP response
└─────────────────────────────────────────┘
```

## Data Flow: Update User

```
PATCH /api/users/:id with UserPatchInput
     │
     ▼
┌─────────────────────────────────────────┐
│  API Route Handler                      │  Partial validation (only provided fields)
└────────────┬────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────┐
│  UpdateUserUseCase.execute(                          │
│    id: string,                                       │
│    input: UserPatchInput                             │
│  )                                                   │
│  ├─ Calls: userRepository.getById(id)                │
│  │  └─ Returns: User                                 │
│  │                                                   │
│  ├─ Calls: buildUserPatch(input)                     │
│  │  ├─ Only processes provided fields                │
│  │  ├─ Validates & normalizes each field             │
│  │  └─ Returns: UserPatch (partial)                  │
│  │                                                   │
│  ├─ Merges: { ...currentUser, ...patch }             │
│  │  └─ Returns: Updated User                         │
│  │                                                   │
│  ├─ Calls: userRepository.update(id, updated)        │
│  │  ├─ Maps User → Prisma model                      │
│  │  ├─ Updates audit.updatedAt, audit.updatedBy      │
│  │  ├─ Updates database                              │
│  │  └─ Returns: Updated User                         │
│  │                                                   │
│  └─ Returns: Promise<User>                           │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  User (updated domain entity)           │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  200 OK Response (JSON)                 │
└─────────────────────────────────────────┘
```

## Key Design Principles

### 1. Separation of Concerns

Each value object has a single responsibility:

```
UserIdentity      → Profile/demographic data
UserContact       → Communication channels
UserPreferences   → User settings & behavior
UserCompliance    → Legal/regulatory requirements
UserEmployment    → HR/org structure
ExternalIds       → Third-party integrations
UserAudit         → Change tracking & lifecycle
```

### 2. Type Safety

Strong typing at each layer:

```
Request Input → NewUserInput (type-checked)
           ↓
Domain Building → buildNewUser() (validates + normalizes)
           ↓
Domain Entity → User (type-safe in memory)
           ↓
Repository → Prisma/MongoDB (persistence layer)
           ↓
Response Output → UserDTO (redacted, serialized)
```

### 3. Immutability & Clear Builders

- Domain entities are built once via builders
- Builders enforce invariants
- Partial updates via `UserPatch` only
- No ad-hoc field mutations

### 4. Audit Trail

Every User tracks:

```
Who created it:    audit.createdBy
When created:      audit.createdAt
Who last changed:  audit.updatedBy
When last changed: audit.updatedAt
Soft-delete info:  audit.isDeleted, audit.deletedAt
```

### 5. Enum-Based Validation

```
Role, Permission, MaritalStatus, EmploymentStatus, Theme
├─ Strong typing
├─ Compiler catches invalid values
├─ Asserters validate at runtime
└─ Tight coupling to domain rules
```

## Testing Strategy

```
┌─────────────────────────────────────────────┐
│ Unit Tests (Domain Layer)                   │
├─────────────────────────────────────────────┤
│ • buildNewUser() with valid/invalid input   │
│ • buildUserPatch() with partial updates     │
│ • Enum validators (assertRole, etc.)        │
│ • Value object builders                     │
│ • Invariant enforcement                     │
│                                              │
│ Example:                                    │
│ describe('buildNewUser', () => {            │
│   it('should build valid user', () => {     │
│     const user = buildNewUser({...});       │
│     expect(user.roles).toEqual(['user']);   │
│   });                                       │
│ });                                         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Integration Tests (Repository Layer)        │
├─────────────────────────────────────────────┤
│ • User ↔ Prisma model mapping               │
│ • Create user in database                   │
│ • Update user in database                   │
│ • Soft-delete logic                         │
│ • Audit trail persistence                   │
│                                              │
│ Example:                                    │
│ describe('PrismaUserRepository', () => {    │
│   it('should persist user with audit', () => { │
│     // Create, verify audit fields          │
│   });                                       │
│ });                                         │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ E2E Tests (API Layer)                       │
├─────────────────────────────────────────────┤
│ • POST /users (create)                      │
│ • GET /users/:id (retrieve)                 │
│ • PATCH /users/:id (update)                 │
│ • Authorization & permissions               │
│ • Response validation                       │
│                                              │
│ Example:                                    │
│ describe('POST /users', () => {             │
│   it('should create user with all fields', () => { │
│     // POST request, assert response       │
│   });                                       │
│ });                                         │
└─────────────────────────────────────────────┘
```

## Transition From Old Structure

```
Old Schema (Before)
┌─────────────────────────────┐
│ User (flat)                 │
├─────────────────────────────┤
│ id, username, email         │
│ firstName, lastName         │
│ externalId                  │
│ address, dateOfBirth        │
│ nextOfKin, contactPerson    │
│ sex, encryptedTaxId         │
│ createdAt, updatedAt        │
└─────────────────────────────┘
          │
          ├─ Identify which fields belong together
          │  (identity, contact, compliance, etc.)
          │
          ├─ Create value objects for each group
          │  (UserIdentity, UserContact, etc.)
          │
          ├─ Move cross-cutting concerns
          │  (audit trail, roles, permissions)
          │
          └─ Add missing fields
             (employment, preferences, etc.)
          │
          ▼
New Schema (After)
┌──────────────────────────────────────────┐
│ User (organized by concern)              │
├──────────────────────────────────────────┤
│ • Core: id, username, email, externalId │
│ • Auth: roles, permissions, isActive     │
│ • Identity: UserIdentity {...}           │
│ • Contact: UserContact {...}             │
│ • Prefs: UserPreferences {...}           │
│ • Compliance: UserCompliance {...}       │
│ • Employment: UserEmployment {...}       │
│ • External: ExternalIds {...}            │
│ • Audit: UserAudit {...}                 │
└──────────────────────────────────────────┘
```

---

**More information:**
- See `USER_DOMAIN_REFACTOR.md` for detailed migration guide
- See `USER_API_EXAMPLES.md` for API request/response examples
- See `USER_REFACTOR_QUICK_REFERENCE.md` for quick lookup
