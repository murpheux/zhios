// JSON Schemas drive both request validation and the generated OpenAPI document.
const uuid = { type: 'string', format: 'uuid' } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;
const bearer = [{ bearerAuth: [] }];

export const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: {},
      },
    },
  },
} as const;

const errorResponses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  502: errorSchema,
} as const;

export const userSchema = {
  type: 'object',
  required: ['id', 'username', 'email', 'firstName', 'lastName', 'externalId', 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    username: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    externalId: { type: 'string', description: 'Okta user id (JWT sub)' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

export const addressSchema = {
  type: 'object',
  required: ['street', 'city', 'stateProvince', 'country', 'postalCode'],
  additionalProperties: false,
  properties: {
    street: { type: 'string', minLength: 1, maxLength: 100 },
    city: { type: 'string', minLength: 1, maxLength: 100 },
    stateProvince: { type: 'string', minLength: 1, maxLength: 100, description: 'US state / CA province code; UK county' },
    country: { type: 'string', enum: ['US', 'CA', 'UK'] },
    postalCode: { type: 'string', minLength: 1, maxLength: 12, description: 'Format validated per country' },
  },
} as const;

const nextOfKinSchema = {
  type: 'object',
  required: ['fullName', 'relationship'],
  additionalProperties: false,
  properties: {
    fullName: { type: 'string', minLength: 1, maxLength: 100 },
    relationship: { type: 'string', minLength: 1, maxLength: 100 },
    phone: { type: 'string', maxLength: 20 },
    email: { type: 'string', maxLength: 254 },
  },
} as const;

const contactPersonSchema = {
  type: 'object',
  required: ['fullName', 'phone'],
  additionalProperties: false,
  properties: {
    fullName: { type: 'string', minLength: 1, maxLength: 100 },
    phone: { type: 'string', maxLength: 20 },
    email: { type: 'string', maxLength: 254 },
  },
} as const;

const sexSchema = { type: 'string', enum: ['male', 'female', "won't-declare"] } as const;
const dateOfBirthSchema = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' } as const;

/** Request-only: SIN (CA) / SSN (US). Encrypted via KMS; never present in any response schema. */
const taxIdRequestSchema = {
  type: 'string',
  minLength: 9,
  maxLength: 11,
  description: 'SIN/SSN, write-only; requires an address with country US or CA',
} as const;

const profileRequestProperties = {
  address: addressSchema,
  dateOfBirth: dateOfBirthSchema,
  nextOfKin: nextOfKinSchema,
  contactPerson: contactPersonSchema,
  sex: sexSchema,
  taxId: taxIdRequestSchema,
} as const;

export const userProfilePayloadSchema = {
  ...userSchema,
  properties: {
    ...userSchema.properties,
    address: { ...addressSchema, nullable: true },
    dateOfBirth: { ...dateOfBirthSchema, nullable: true },
    nextOfKin: { ...nextOfKinSchema, nullable: true },
    contactPerson: { ...contactPersonSchema, nullable: true },
    sex: { ...sexSchema, nullable: true },
  },
} as const;

export const bankAccountSchema = {
  type: 'object',
  required: ['id', 'userId', 'accountNumber', 'accountType', 'balance', 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    userId: uuid,
    accountNumber: { type: 'string' },
    accountType: { type: 'string', enum: ['checking', 'savings'] },
    balance: { type: 'string', pattern: '^\\d+$', description: 'Integer minor units (cents/satoshis)' },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
} as const;

const profileSchema = {
  type: 'object',
  required: [...userProfilePayloadSchema.required, 'accounts', 'totalBalance'],
  properties: {
    ...userProfilePayloadSchema.properties,
    accounts: { type: 'array', items: bankAccountSchema },
    totalBalance: { type: 'string', pattern: '^\\d+$' },
  },
} as const;

const walletSyncSchema = {
  type: 'object',
  required: ['userId', 'wallets', 'fetchedAt', 'cached'],
  properties: {
    userId: uuid,
    wallets: {
      type: 'array',
      items: { type: 'object', additionalProperties: true, properties: { id: { type: 'string' } } },
    },
    fetchedAt: dateTime,
    cached: { type: 'boolean' },
  },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: uuid },
} as const;

const accountParams = {
  type: 'object',
  required: ['id', 'accountId'],
  properties: { id: uuid, accountId: uuid },
} as const;

const common = { security: bearer } as const;

export const createUserSchema = {
  ...common,
  tags: ['users'],
  summary: 'Register the authenticated Okta identity as a user',
  body: {
    type: 'object',
    required: ['username', 'email', 'firstName', 'lastName'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 32 },
      email: { type: 'string', maxLength: 254 },
      firstName: { type: 'string', minLength: 1, maxLength: 100 },
      lastName: { type: 'string', minLength: 1, maxLength: 100 },
      ...profileRequestProperties,
    },
  },
  response: { 201: userProfilePayloadSchema, ...errorResponses },
} as const;

export const getUserSchema = {
  ...common,
  tags: ['users'],
  summary: 'Get a user',
  params: idParams,
  response: { 200: userProfilePayloadSchema, ...errorResponses },
} as const;

export const getProfileSchema = {
  ...common,
  tags: ['users'],
  summary: 'Get a user with bank accounts and total balance',
  params: idParams,
  response: { 200: profileSchema, ...errorResponses },
} as const;

export const updateUserSchema = {
  ...common,
  tags: ['users'],
  summary: 'Update a user',
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 32 },
      email: { type: 'string', maxLength: 254 },
      firstName: { type: 'string', minLength: 1, maxLength: 100 },
      lastName: { type: 'string', minLength: 1, maxLength: 100 },
      ...profileRequestProperties,
    },
  },
  response: { 200: userProfilePayloadSchema, ...errorResponses },
} as const;

export const linkAccountSchema = {
  ...common,
  tags: ['accounts'],
  summary: 'Link a bank account to a user',
  params: idParams,
  body: {
    type: 'object',
    required: ['accountType'],
    additionalProperties: false,
    properties: {
      accountType: { type: 'string', enum: ['checking', 'savings'] },
      accountNumber: { type: 'string', description: '8-17 digits; generated when omitted' },
    },
  },
  response: { 201: bankAccountSchema, ...errorResponses },
} as const;

export const listAccountsSchema = {
  ...common,
  tags: ['accounts'],
  summary: 'List a user\'s bank accounts',
  params: idParams,
  response: { 200: { type: 'array', items: bankAccountSchema }, ...errorResponses },
} as const;

export const getAccountSchema = {
  ...common,
  tags: ['accounts'],
  summary: 'Get a bank account',
  params: accountParams,
  response: { 200: bankAccountSchema, ...errorResponses },
} as const;

export const updateAccountSchema = {
  ...common,
  tags: ['accounts'],
  summary: 'Update a bank account (account type only; balances are not client-writable)',
  params: accountParams,
  body: {
    type: 'object',
    required: ['accountType'],
    additionalProperties: false,
    properties: { accountType: { type: 'string', enum: ['checking', 'savings'] } },
  },
  response: { 200: bankAccountSchema, ...errorResponses },
} as const;

export const deleteAccountSchema = {
  ...common,
  tags: ['accounts'],
  summary: 'Close a bank account (balance must be zero)',
  params: accountParams,
  response: { 204: { type: 'null', description: 'Deleted' }, ...errorResponses },
} as const;

export const walletSchema = {
  ...common,
  tags: ['wallet'],
  summary: 'Sync the user\'s wallets from zuma wallet-service (cached in Redis)',
  params: idParams,
  response: { 200: walletSyncSchema, ...errorResponses },
} as const;
