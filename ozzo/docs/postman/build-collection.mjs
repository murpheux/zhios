#!/usr/bin/env node
// Generates ozzo.postman_collection.json (Postman Collection v2.1) from this file.
// Edit requests HERE, then run:  node docs/postman/build-collection.mjs  (from ozzo/)
// and verify with any API testing.
//
// The collection is a self-contained end-to-end scenario: folders run in order, create their own
// data, and chain ids through collection variables. Auth tokens are minted by the collection-level
// pre-request script (HS256 via CryptoJS, or fetched from a mock OIDC server when authMode=oidc).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------
// Constants derived from ozzo code (keep in sync with services/ozzo/src)
// ---------------------------------------------------------------------------------------------
const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const SATS_BALANCE = '^(0|[1-9][0-9]{0,15})$';

// Valid test addresses / data
const TEST_USERNAME = 'testuser.001';
const TEST_EMAIL = 'testuser@example.com';
const TEST_FIRST_NAME = 'Test';
const TEST_LAST_NAME = 'User';
const TEST_DOB = '1990-01-15';

// Address test data
const TEST_ADDRESS_US = {
  street: '123 Main St',
  city: 'New York',
  state: 'NY',
  country: 'US',
  postalCode: '10001',
  region: 'US',
};

const TEST_ADDRESS_CA = {
  street: '456 Maple Ave',
  city: 'Toronto',
  state: 'ON',
  country: 'CA',
  postalCode: 'M5V 3A8',
  region: 'CA',
};

const TEST_ADDRESS_UK = {
  street: '789 High Street',
  city: 'London',
  state: 'England',
  country: 'UK',
  postalCode: 'SW1A 1AA',
  region: 'UK',
};

const TEST_NEXT_OF_KIN = {
  name: 'Jane Doe',
  relationship: 'Spouse',
  phone: '+1-555-123-4567',
};

const TEST_CONTACT_PERSON = {
  name: 'John Doe',
  title: 'Account Manager',
  email: 'john.doe@example.com',
};

// Bank account test data
const TEST_ACCOUNT_TYPE = 'checking';

// Wallet sync mock response structure
const walletSyncResponse = {
  userId: '{{userId}}',
  wallets: [],
  fetchedAt: '{{$timestamp}}',
  cached: false,
};

// ---------------------------------------------------------------------------------------------
// JSON schemas used by pm.response.to.have.jsonSchema (no `format`, the sandbox Ajv may lack it)
// ---------------------------------------------------------------------------------------------
const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'object' },
      },
    },
  },
};

const userSchema = {
  type: 'object',
  required: ['id', 'username', 'email', 'firstName', 'lastName', 'externalId', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: UUID_PATTERN },
    username: { type: 'string' },
    email: { type: 'string' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    externalId: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const addressSchema = {
  type: 'object',
  required: ['street', 'city', 'state', 'country', 'postalCode', 'region'],
  properties: {
    street: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    country: { type: 'string' },
    postalCode: { type: 'string' },
    region: { enum: ['US', 'CA', 'UK'] },
  },
};

const userProfileSchema = {
  type: 'object',
  required: [
    'id',
    'username',
    'email',
    'firstName',
    'lastName',
    'externalId',
    'dateOfBirth',
    'sex',
    'address',
    'nextOfKin',
    'contactPerson',
    'accounts',
    'totalBalance',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    ...userSchema.properties,
    dateOfBirth: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    sex: { enum: ['male', 'female', "won't-declare"] },
    address: addressSchema,
    nextOfKin: {
      type: 'object',
      required: ['name', 'relationship', 'phone'],
      properties: {
        name: { type: 'string' },
        relationship: { type: 'string' },
        phone: { type: 'string' },
      },
    },
    contactPerson: {
      type: 'object',
      required: ['name', 'title', 'email'],
      properties: {
        name: { type: 'string' },
        title: { type: 'string' },
        email: { type: 'string' },
      },
    },
    accounts: { type: 'array', items: { type: 'object' } },
    totalBalance: { type: 'string', pattern: SATS_BALANCE },
  },
};

const bankAccountSchema = {
  type: 'object',
  required: ['id', 'userId', 'accountNumber', 'accountType', 'balance', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', pattern: UUID_PATTERN },
    userId: { type: 'string', pattern: UUID_PATTERN },
    accountNumber: { type: 'string' },
    accountType: { type: 'string', enum: ['checking', 'savings'] },
    balance: { type: 'string', pattern: SATS_BALANCE },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const walletSyncSchema = {
  type: 'object',
  required: ['userId', 'wallets', 'fetchedAt', 'cached'],
  properties: {
    userId: { type: 'string' },
    wallets: { type: 'array' },
    fetchedAt: { type: 'string' },
    cached: { type: 'boolean' },
  },
};

// ---------------------------------------------------------------------------------------------
// Request/Response chains (executed in order, chain data via variables)
// ---------------------------------------------------------------------------------------------
const items = [];

// -------- USERS (Create, Get, Update, Profile) --------
items.push({
  name: 'Users',
  item: [
    {
      name: 'POST /users (create)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 201', () => pm.response.code === 201);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('userSchema')));",
              "const user = pm.response.json();",
              "pm.collectionVariables.set('userId', user.id);",
              "pm.collectionVariables.set('username', user.username);",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            username: TEST_USERNAME,
            email: TEST_EMAIL,
            firstName: TEST_FIRST_NAME,
            lastName: TEST_LAST_NAME,
            dateOfBirth: TEST_DOB,
            sex: 'male',
            address: TEST_ADDRESS_US,
            nextOfKin: TEST_NEXT_OF_KIN,
            contactPerson: TEST_CONTACT_PERSON,
          }),
        },
        url: {
          raw: '{{baseUrl}}/users',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users'],
        },
      },
      response: [],
    },
    {
      name: 'GET /users/:id (retrieve)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('userSchema')));",
              "const user = pm.response.json();",
              "pm.test('Username matches', () => user.username === pm.collectionVariables.get('username'));",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}'],
        },
      },
      response: [],
    },
    {
      name: 'GET /users/:id/profile (with accounts and balance)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid (profile)', () => pm.response.to.have.jsonSchema(pm.variables.get('userProfileSchema')));",
              "const profile = pm.response.json();",
              "pm.test('Has accounts array', () => Array.isArray(profile.accounts));",
              "pm.test('Has address', () => profile.address && profile.address.region === 'US');",
              "pm.test('Has next of kin', () => profile.nextOfKin && profile.nextOfKin.name);",
              "pm.test('Has contact person', () => profile.contactPerson && profile.contactPerson.name);",
              "pm.test('totalBalance is numeric string', () => /^\\d+$/.test(profile.totalBalance));",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/profile',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'profile'],
        },
      },
      response: [],
    },
    {
      name: 'PATCH /users/:id (update profile)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('userSchema')));",
              "const user = pm.response.json();",
              "pm.test('First name updated', () => user.firstName === 'UpdatedTest');",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            firstName: 'UpdatedTest',
          }),
        },
        url: {
          raw: '{{baseUrl}}/users/{{userId}}',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}'],
        },
      },
      response: [],
    },
  ],
});

// -------- BANK ACCOUNTS (Link, List, Get, Update, Delete) --------
items.push({
  name: 'Bank Accounts',
  item: [
    {
      name: 'POST /users/:id/accounts (link account)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 201', () => pm.response.code === 201);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('bankAccountSchema')));",
              "const account = pm.response.json();",
              "pm.collectionVariables.set('accountId', account.id);",
              "pm.collectionVariables.set('accountNumber', account.accountNumber);",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'POST',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            accountType: TEST_ACCOUNT_TYPE,
          }),
        },
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/accounts',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'accounts'],
        },
      },
      response: [],
    },
    {
      name: 'GET /users/:id/accounts (list all)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('Is array', () => Array.isArray(pm.response.json()));",
              "const accounts = pm.response.json();",
              "pm.test('At least one account', () => accounts.length > 0);",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/accounts',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'accounts'],
        },
      },
      response: [],
    },
    {
      name: 'GET /users/:id/accounts/:accountId (retrieve single)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('bankAccountSchema')));",
              "const account = pm.response.json();",
              "pm.test('Account type is checking', () => account.accountType === '" +
                TEST_ACCOUNT_TYPE +
                "');",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/accounts/{{accountId}}',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'accounts', '{{accountId}}'],
        },
      },
      response: [],
    },
    {
      name: 'PATCH /users/:id/accounts/:accountId (update type)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('bankAccountSchema')));",
              "const account = pm.response.json();",
              "pm.test('Account type updated to savings', () => account.accountType === 'savings');",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'PATCH',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            accountType: 'savings',
          }),
        },
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/accounts/{{accountId}}',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'accounts', '{{accountId}}'],
        },
      },
      response: [],
    },
    {
      name: 'DELETE /users/:id/accounts/:accountId (close account)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 204', () => pm.response.code === 204);",
              "pm.test('No content in response', () => pm.response.text() === '');",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'DELETE',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/accounts/{{accountId}}',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'accounts', '{{accountId}}'],
        },
      },
      response: [],
    },
  ],
});

// -------- WALLET SYNC --------
items.push({
  name: 'Wallet Sync',
  item: [
    {
      name: 'GET /users/:id/wallet (sync wallets from zuma)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "pm.test('JSON schema valid', () => pm.response.to.have.jsonSchema(pm.variables.get('walletSyncSchema')));",
              "const sync = pm.response.json();",
              "pm.test('Has userId', () => sync.userId === pm.collectionVariables.get('userId'));",
              "pm.test('Has wallets array', () => Array.isArray(sync.wallets));",
              "pm.test('Has fetchedAt timestamp', () => sync.fetchedAt);",
              "pm.test('Has cached flag', () => typeof sync.cached === 'boolean');",
            ],
          },
        },
      ],
      request: {
        auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{ownerToken}}' }] },
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/users/{{userId}}/wallet',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['users', '{{userId}}', 'wallet'],
        },
      },
      response: [],
    },
  ],
});

// -------- HEALTH & READINESS --------
items.push({
  name: 'Operations',
  item: [
    {
      name: 'GET /healthz (health check)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: ["pm.test('Status 200', () => pm.response.code === 200);", "pm.test('Has status ok', () => pm.response.json().status === 'ok');"],
          },
        },
      ],
      request: {
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/healthz',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['healthz'],
        },
      },
      response: [],
    },
    {
      name: 'GET /readyz (readiness check)',
      event: [
        {
          listen: 'test',
          script: {
            type: 'text/javascript',
            exec: [
              "pm.test('Status 200', () => pm.response.code === 200);",
              "const ready = pm.response.json();",
              "pm.test('Has status field', () => ready.status);",
              "pm.test('Has checks field', () => typeof ready.checks === 'object');",
            ],
          },
        },
      ],
      request: {
        method: 'GET',
        url: {
          raw: '{{baseUrl}}/readyz',
          protocol: 'http',
          host: ['{{baseUrl}}'],
          path: ['readyz'],
        },
      },
      response: [],
    },
  ],
});

// -------- Build the collection --------
const collection = {
  info: {
    _postman_id: 'a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6',
    name: 'ozzo API (end-to-end)',
    description:
      "Account & subscription management: users (with profile/address data), bank accounts, and wallet sync.\n\nRun the whole collection in order: it creates its own data and chains ids through collection variables. Auth tokens are minted by the collection pre-request script (authMode=hs256 needs jwtSecret; authMode=oidc fetches from oidcTokenUrl). See docs/postman/README.md.\n\nGENERATED by docs/postman/build-collection.mjs — edit that file, not this JSON.",
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: {
    type: 'noauth',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          "// ozzo collection pre-request: mints/refreshes auth tokens before EVERY request.",
          "// Variables come from the environment (or newman --env-var); results go to collection variables.",
          "//   authMode=hs256: HS256 user JWTs signed with jwtSecret, exactly as shared/http/src/auth.ts verifies",
          "//                   them (alg HS256, iss=jwtIssuer, aud=jwtAudience if set, sub+exp required, roles[]).",
          "//   authMode=oidc : RS256 user tokens fetched from the mock OIDC token endpoint. Use against a stack",
          "//                   WITH JWT_JWKS_URI (root docker-compose.yml / Terraform).",
          "// Actual user ids (token sub) are exposed as userId.",
          "",
          "const cv = pm.collectionVariables;",
          "const v = function (k, d) {",
          "  const x = pm.variables.get(k);",
          "  return x === undefined || x === null || x === '' ? (d === undefined ? '' : d) : String(x);",
          "};",
          "const now = Math.floor(Date.now() / 1000);",
          "const ttl = Math.min(Math.max(parseInt(v('jwtTtlSeconds', '300'), 10) || 300, 30), 3600);",
          "",
          "const b64url = function (wordArray) {",
          "  return CryptoJS.enc.Base64.stringify(wordArray).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');",
          "};",
          "const segment = function (obj) { return b64url(CryptoJS.enc.Utf8.parse(JSON.stringify(obj))); };",
          "const signHs256 = function (claims, secret, header) {",
          "  const input = segment(header || { alg: 'HS256', typ: 'JWT' }) + '.' + segment(claims);",
          "  return input + '.' + b64url(CryptoJS.HmacSHA256(input, secret));",
          "};",
          "const decodePayload = function (jwt) {",
          "  const part = String(jwt).split('.')[1] || '';",
          "  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4);",
          "  return JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(b64)));",
          "};",
          "",
          "const userClaims = function (sub, overrides) {",
          "  const c = { sub: sub, roles: [], iss: v('jwtIssuer', 'ozzo'), iat: now, exp: now + ttl };",
          "  if (v('jwtAudience')) c.aud = v('jwtAudience');",
          "  return Object.assign(c, overrides || {});",
          "};",
          "",
          "const mode = v('authMode', 'hs256').toLowerCase();",
          "const jwtSecret = v('jwtSecret');",
          "",
          "if (mode === 'hs256') {",
          "  if (!jwtSecret) {",
          "    console.warn('[ozzo] jwtSecret is empty: user tokens not minted (authenticated requests will get 401)');",
          "  } else {",
          "    const ownerSub = v('ownerSub', 'user-alice');",
          "    cv.set('ownerToken', signHs256(userClaims(ownerSub), jwtSecret));",
          "    cv.set('ownerSub', ownerSub);",
          "    cv.set('ownerTokenMode', 'hs256');",
          "  }",
          "} else if (mode === 'oidc') {",
          "  const tokenUrl = v('oidcTokenUrl', 'http://localhost:8090/ozzo/token');",
          "  const ownerSub = v('ownerSub', 'user-alice');",
          "  const cachedExp = parseInt(cv.get('ownerTokenExp') || '0', 10);",
          "  if (cv.get('ownerTokenMode') === 'oidc' && cachedExp - 30 > now) return;",
          "  const header = [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }];",
          "  if (v('oidcHostHeader')) header.push({ key: 'Host', value: v('oidcHostHeader') });",
          "  pm.sendRequest({",
          "    url: tokenUrl,",
          "    method: 'POST',",
          "    header: header,",
          "    body: {",
          "      mode: 'urlencoded',",
          "      urlencoded: [",
          "        { key: 'grant_type', value: 'client_credentials' },",
          "        { key: 'client_id', value: v('oidcClientId', 'ozzo-postman') },",
          "        { key: 'client_secret', value: v('oidcClientSecret', 'mock-not-a-secret') },",
          "        { key: 'scope', value: v('ownerOidcScope', 'ozzo-user') },",
          "      ],",
          "    },",
          "  }, function (_, res) {",
          "    try {",
          "      const token = res.json().access_token;",
          "      const payload = decodePayload(token);",
          "      cv.set('ownerToken', token);",
          "      cv.set('ownerSub', payload.sub);",
          "      cv.set('ownerTokenExp', payload.exp);",
          "      cv.set('ownerTokenMode', 'oidc');",
          "    } catch (e) {",
          "      console.error('[ozzo] Failed to fetch OIDC token:', e.message);",
          "    }",
          "  });",
          "}",
        ],
      },
    },
  ],
  item: items,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3004', type: 'string' },
    { key: 'jwtSecret', value: 'your-32-char-minimum-secret-key', type: 'string' },
    { key: 'jwtIssuer', value: 'ozzo', type: 'string' },
    { key: 'jwtAudience', value: '', type: 'string' },
    { key: 'jwtTtlSeconds', value: '300', type: 'string' },
    { key: 'authMode', value: 'hs256', type: 'string' },
    { key: 'oidcTokenUrl', value: '', type: 'string' },
    { key: 'oidcClientId', value: '', type: 'string' },
    { key: 'oidcClientSecret', value: '', type: 'string' },
    { key: 'oidcHostHeader', value: '', type: 'string' },
    { key: 'ownerSub', value: 'user-alice', type: 'string' },
    { key: 'ownerOidcScope', value: 'ozzo-user', type: 'string' },
    // Runtime variables populated by requests
    { key: 'userId', value: '', type: 'string' },
    { key: 'username', value: '', type: 'string' },
    { key: 'accountId', value: '', type: 'string' },
    { key: 'accountNumber', value: '', type: 'string' },
    { key: 'ownerToken', value: '', type: 'string' },
    // Schema variables for tests
    { key: 'userSchema', value: JSON.stringify(userSchema), type: 'string' },
    { key: 'userProfileSchema', value: JSON.stringify(userProfileSchema), type: 'string' },
    { key: 'bankAccountSchema', value: JSON.stringify(bankAccountSchema), type: 'string' },
    { key: 'walletSyncSchema', value: JSON.stringify(walletSyncSchema), type: 'string' },
    { key: 'errorSchema', value: JSON.stringify(errorSchema), type: 'string' },
  ],
};

// Write the collection
const output = join(here, 'ozzo.postman_collection.json');
writeFileSync(output, JSON.stringify(collection, null, 2) + '\n');
console.log(`✓ Generated ${output}`);
