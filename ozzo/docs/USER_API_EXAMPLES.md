# User API Examples

Examples of API requests and responses using the refactored User domain structure.

## Create User

### Request

```http
POST /api/users
Content-Type: application/json
Authorization: Bearer <token>

{
  "username": "alice.smith",
  "email": "alice@example.com",
  "externalId": "okta-user-456",
  "identity": {
    "displayName": "Alice Smith",
    "middleName": "Marie",
    "firstName": "Alice",
    "lastName": "Smith",
    "preferredName": "Ali",
    "profilePhotoUrl": "https://cdn.example.com/photos/alice.jpg",
    "nationality": "US",
    "preferredLanguage": "en",
    "maritalStatus": "single",
    "dateOfBirth": "1992-03-15",
    "sex": "female"
  },
  "contact": {
    "phoneNumber": "+1-404-555-0100",
    "mobileNumber": "+1-404-555-0101",
    "secondaryEmail": "alice@work.example.com"
  },
  "address": {
    "street": "456 Oak Avenue",
    "city": "Atlanta",
    "stateProvince": "GA",
    "country": "US",
    "postalCode": "30301"
  },
  "preferences": {
    "timeZone": "America/New_York",
    "locale": "en-US",
    "theme": "dark",
    "notificationPreferences": {
      "emailNotifications": true,
      "smsNotifications": true,
      "inAppNotifications": true,
      "marketingEmails": true
    }
  },
  "emergencyContacts": {
    "primaryContact": {
      "fullName": "Robert Smith",
      "relationship": "Father",
      "phone": "+1-404-555-0102",
      "email": "robert@example.com"
    },
    "secondaryContact": {
      "fullName": "Carol Smith",
      "relationship": "Mother",
      "phone": "+1-404-555-0103"
    }
  },
  "employment": {
    "employeeNumber": "EMP-2024-001",
    "departmentId": "dept-engineering",
    "jobTitle": "Software Engineer",
    "managerId": "user-789",
    "hireDate": "2024-01-10",
    "employmentStatus": "active"
  },
  "compliance": {
    "encryptedTaxId": "abc123def456ghi789",
    "termsAcceptedAt": "2024-01-10T15:30:00Z",
    "privacyPolicyAcceptedAt": "2024-01-10T15:30:00Z",
    "marketingConsent": true,
    "marketingConsentUpdatedAt": "2024-01-10T15:30:00Z"
  },
  "externalIds": {
    "okta": "okta-user-456",
    "azureAd": "azure-user-789",
    "google": "google@example.com",
    "employeeSystem": "ERP-2024-001"
  },
  "roles": ["user", "employee"],
  "permissions": ["read:profile", "write:profile", "read:transactions"]
}
```

### Response

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "user-123abc",
  "username": "alice.smith",
  "email": "alice@example.com",
  "externalId": "okta-user-456",
  "roles": ["user", "employee"],
  "permissions": ["read:profile", "write:profile", "read:transactions"],
  "isActive": true,
  "emailVerified": false,
  "phoneVerified": false,
  "lastLoginAt": null,
  "lastPasswordChangeAt": "2024-01-10T15:30:00Z",
  "mfaEnabled": false,
  "identity": {
    "middleName": "Marie",
    "preferredName": "Ali",
    "displayName": "Alice Smith",
    "profilePhotoUrl": "https://cdn.example.com/photos/alice.jpg",
    "nationality": "US",
    "preferredLanguage": "en",
    "maritalStatus": "single",
    "dateOfBirth": "1992-03-15T00:00:00Z",
    "sex": "female"
  },
  "contact": {
    "phoneNumber": "+1-404-555-0100",
    "mobileNumber": "+1-404-555-0101",
    "secondaryEmail": "alice@work.example.com"
  },
  "address": {
    "street": "456 Oak Avenue",
    "city": "Atlanta",
    "stateProvince": "GA",
    "country": "US",
    "postalCode": "30301"
  },
  "preferences": {
    "timeZone": "America/New_York",
    "locale": "en-US",
    "theme": "dark",
    "notificationPreferences": {
      "emailNotifications": true,
      "smsNotifications": true,
      "inAppNotifications": true,
      "marketingEmails": true
    }
  },
  "emergencyContacts": {
    "primaryContact": {
      "fullName": "Robert Smith",
      "relationship": "Father",
      "phone": "+1-404-555-0102",
      "email": "robert@example.com"
    },
    "secondaryContact": {
      "fullName": "Carol Smith",
      "relationship": "Mother",
      "phone": "+1-404-555-0103",
      "email": null
    },
    "nextOfKin": null
  },
  "employment": {
    "employeeNumber": "EMP-2024-001",
    "departmentId": "dept-engineering",
    "jobTitle": "Software Engineer",
    "managerId": "user-789",
    "hireDate": "2024-01-10T00:00:00Z",
    "employmentStatus": "active"
  },
  "compliance": {
    "encryptedTaxId": "abc123def456ghi789",
    "termsAcceptedAt": "2024-01-10T15:30:00Z",
    "privacyPolicyAcceptedAt": "2024-01-10T15:30:00Z",
    "marketingConsent": true,
    "marketingConsentUpdatedAt": "2024-01-10T15:30:00Z"
  },
  "externalIds": {
    "okta": "okta-user-456",
    "azureAd": "azure-user-789",
    "google": "google@example.com",
    "employeeSystem": "ERP-2024-001"
  },
  "audit": {
    "createdBy": null,
    "updatedBy": null,
    "deletedAt": null,
    "deactivatedAt": null,
    "isDeleted": false,
    "createdAt": "2024-01-10T15:30:00Z",
    "updatedAt": "2024-01-10T15:30:00Z"
  }
}
```

## Update User (Partial)

### Request

```http
PATCH /api/users/user-123abc
Content-Type: application/json
Authorization: Bearer <token>

{
  "preferences": {
    "theme": "light",
    "locale": "en-CA"
  },
  "employment": {
    "jobTitle": "Senior Software Engineer"
  },
  "contact": {
    "mobileNumber": "+1-404-555-9999"
  }
}
```

### Response

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "user-123abc",
  "username": "alice.smith",
  "email": "alice@example.com",
  "externalId": "okta-user-456",
  "roles": ["user", "employee"],
  "permissions": ["read:profile", "write:profile", "read:transactions"],
  "isActive": true,
  "emailVerified": false,
  "phoneVerified": false,
  "lastLoginAt": null,
  "lastPasswordChangeAt": "2024-01-10T15:30:00Z",
  "mfaEnabled": false,
  "identity": { ... },
  "contact": {
    "phoneNumber": "+1-404-555-0100",
    "mobileNumber": "+1-404-555-9999",
    "secondaryEmail": "alice@work.example.com"
  },
  "address": { ... },
  "preferences": {
    "timeZone": "America/New_York",
    "locale": "en-CA",
    "theme": "light",
    "notificationPreferences": { ... }
  },
  "emergencyContacts": { ... },
  "employment": {
    "employeeNumber": "EMP-2024-001",
    "departmentId": "dept-engineering",
    "jobTitle": "Senior Software Engineer",
    "managerId": "user-789",
    "hireDate": "2024-01-10T00:00:00Z",
    "employmentStatus": "active"
  },
  "compliance": { ... },
  "externalIds": { ... },
  "audit": {
    "createdBy": null,
    "updatedBy": "user-admin-001",
    "deletedAt": null,
    "deactivatedAt": null,
    "isDeleted": false,
    "createdAt": "2024-01-10T15:30:00Z",
    "updatedAt": "2024-01-10T16:45:00Z"
  }
}
```

## Get User

### Request

```http
GET /api/users/user-123abc
Authorization: Bearer <token>
```

### Response (200 OK)

```json
{
  "id": "user-123abc",
  "username": "alice.smith",
  "email": "alice@example.com",
  "externalId": "okta-user-456",
  "roles": ["user", "employee"],
  "permissions": ["read:profile", "write:profile", "read:transactions"],
  "isActive": true,
  "emailVerified": false,
  "phoneVerified": false,
  "lastLoginAt": "2024-01-15T10:30:00Z",
  "lastPasswordChangeAt": "2024-01-10T15:30:00Z",
  "mfaEnabled": false,
  "identity": {
    "middleName": "Marie",
    "preferredName": "Ali",
    "displayName": "Alice Smith",
    "profilePhotoUrl": "https://cdn.example.com/photos/alice.jpg",
    "nationality": "US",
    "preferredLanguage": "en",
    "maritalStatus": "single",
    "dateOfBirth": "1992-03-15T00:00:00Z",
    "sex": "female"
  },
  "contact": {
    "phoneNumber": "+1-404-555-0100",
    "mobileNumber": "+1-404-555-9999",
    "secondaryEmail": "alice@work.example.com"
  },
  "address": {
    "street": "456 Oak Avenue",
    "city": "Atlanta",
    "stateProvince": "GA",
    "country": "US",
    "postalCode": "30301"
  },
  "preferences": {
    "timeZone": "America/New_York",
    "locale": "en-CA",
    "theme": "light",
    "notificationPreferences": {
      "emailNotifications": true,
      "smsNotifications": true,
      "inAppNotifications": true,
      "marketingEmails": true
    }
  },
  "emergencyContacts": {
    "primaryContact": {
      "fullName": "Robert Smith",
      "relationship": "Father",
      "phone": "+1-404-555-0102",
      "email": "robert@example.com"
    },
    "secondaryContact": {
      "fullName": "Carol Smith",
      "relationship": "Mother",
      "phone": "+1-404-555-0103",
      "email": null
    },
    "nextOfKin": null
  },
  "employment": {
    "employeeNumber": "EMP-2024-001",
    "departmentId": "dept-engineering",
    "jobTitle": "Senior Software Engineer",
    "managerId": "user-789",
    "hireDate": "2024-01-10T00:00:00Z",
    "employmentStatus": "active"
  },
  "compliance": {
    "encryptedTaxId": "abc123def456ghi789",
    "termsAcceptedAt": "2024-01-10T15:30:00Z",
    "privacyPolicyAcceptedAt": "2024-01-10T15:30:00Z",
    "marketingConsent": true,
    "marketingConsentUpdatedAt": "2024-01-10T15:30:00Z"
  },
  "externalIds": {
    "okta": "okta-user-456",
    "azureAd": "azure-user-789",
    "google": "google@example.com",
    "employeeSystem": "ERP-2024-001"
  },
  "audit": {
    "createdBy": null,
    "updatedBy": "user-admin-001",
    "deletedAt": null,
    "deactivatedAt": null,
    "isDeleted": false,
    "createdAt": "2024-01-10T15:30:00Z",
    "updatedAt": "2024-01-10T16:45:00Z"
  }
}
```

## Minimal User Response

For endpoints that return user lists or don't need full detail:

```json
{
  "id": "user-123abc",
  "username": "alice.smith",
  "email": "alice@example.com",
  "isActive": true,
  "roles": ["user", "employee"],
  "identity": {
    "displayName": "Alice Smith",
    "profilePhotoUrl": "https://cdn.example.com/photos/alice.jpg"
  },
  "audit": {
    "createdAt": "2024-01-10T15:30:00Z",
    "updatedAt": "2024-01-10T16:45:00Z"
  }
}
```

## Filter/Search Examples

### List Active Users with Role Filter

```http
GET /api/users?isActive=true&roles=employee&department=dept-engineering
Authorization: Bearer <token>
```

### List Users Updated After Date

```http
GET /api/users?updatedAfter=2024-01-01T00:00:00Z&limit=50&offset=0
Authorization: Bearer <token>
```

## Error Responses

### 400 Bad Request - Invalid Input

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Invalid input",
  "details": [
    {
      "field": "identity.displayName",
      "message": "displayName is required"
    },
    {
      "field": "contact.phoneNumber",
      "message": "phoneNumber is not a valid phone number"
    }
  ]
}
```

### 404 Not Found

```json
{
  "error": "NOT_FOUND",
  "message": "User not found",
  "userId": "user-123abc"
}
```

### 409 Conflict - User Already Exists

```json
{
  "error": "CONFLICT",
  "message": "User already exists",
  "field": "email",
  "value": "alice@example.com"
}
```

## Field Constraints

| Field | Constraint | Example |
|---|---|---|
| `username` | 3-32 chars, alphanumeric + `._-` | `alice.smith` |
| `email` | RFC 5322, max 254 chars | `alice@example.com` |
| `identity.displayName` | 1-100 chars | `Alice Smith` |
| `contact.phoneNumber` | E.164 or regional format | `+1-404-555-0100` |
| `address.country` | Must be `'US'`, `'CA'`, or `'UK'` | `'US'` |
| `preferences.theme` | Must be `'light'`, `'dark'`, or `'system'` | `'light'` |
| `roles` | Must be valid from enum | `['user', 'employee']` |
| `employment.employmentStatus` | Must be `'active'`, `'inactive'`, `'on-leave'`, or `'terminated'` | `'active'` |
| `identity.maritalStatus` | Must be from enum or null | `'married'`, `'single'`, etc. |

## Rate Limits

- **GET** requests: 100 requests/min per user
- **POST/PUT/PATCH** requests: 30 requests/min per user
- **Bulk operations**: Contact support for higher limits

## Response Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1705250460
X-Request-ID: req-abc123def456
X-Response-Time: 42ms
```
