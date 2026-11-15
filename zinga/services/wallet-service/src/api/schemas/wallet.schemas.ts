// Fastify JSON schemas for wallet routes; doubles as the OpenAPI source for @fastify/swagger.
import { OBJECT_ID_PATTERN, SATS_AMOUNT_PATTERN, SATS_BALANCE_PATTERN } from '@zinga/shared-common';

const networkEnum = ['mainnet', 'testnet', 'regtest'];
const walletKindEnum = ['hot', 'cold', 'custodial', 'non-custodial'];
const walletStatusEnum = ['active', 'suspended', 'archived'];

export const errorResponseSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    code: { type: 'string' },
    message: { type: 'string' },
    details: { type: 'object', additionalProperties: true },
  },
  required: ['statusCode', 'code', 'message'],
} as const;

export const walletResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    address: { type: 'string' },
    network: { type: 'string', enum: networkEnum },
    type: { type: 'string', enum: walletKindEnum },
    balanceCache: { type: 'string', pattern: SATS_BALANCE_PATTERN, description: 'Balance in satoshis' },
    metadata: { type: 'object', additionalProperties: true },
    ownerUserId: { type: 'string' },
    status: { type: 'string', enum: walletStatusEnum },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'label',
    'address',
    'network',
    'type',
    'balanceCache',
    'metadata',
    'ownerUserId',
    'status',
    'createdAt',
    'updatedAt',
  ],
} as const;

export const createWalletSchema = {
  description: 'Create a new wallet',
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      label: { type: 'string', minLength: 1 },
      network: { type: 'string', enum: networkEnum },
      type: { type: 'string', enum: walletKindEnum },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['label', 'network', 'type'],
    examples: [{ label: 'My Hot Wallet', network: 'testnet', type: 'hot' }],
  },
  response: {
    201: walletResponseSchema,
    400: errorResponseSchema,
  },
} as const;

export const walletParamsSchema = {
  type: 'object',
  properties: { id: { type: 'string', pattern: OBJECT_ID_PATTERN } },
  required: ['id'],
} as const;

export const getWalletSchema = {
  description: 'Fetch a wallet by id',
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  response: {
    200: {
      ...walletResponseSchema,
      examples: [
        {
          id: '6710f1f1c2a1b2c3d4e5f6a7',
          label: 'My Hot Wallet',
          address: 'tb1q...',
          network: 'testnet',
          type: 'hot',
          balanceCache: '0',
          metadata: {},
          ownerUserId: 'user-123',
          status: 'active',
          createdAt: '2024-10-13T12:00:00.000Z',
          updatedAt: '2024-10-13T12:00:00.000Z',
        },
      ],
    },
    404: errorResponseSchema,
  },
} as const;

export const listWalletsSchema = {
  description: 'List wallets with pagination',
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      ownerUserId: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        items: { type: 'array', items: walletResponseSchema },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
      required: ['items', 'total', 'page', 'limit', 'totalPages'],
    },
  },
} as const;

export const updateMetadataSchema = {
  description: "Update a wallet's label/metadata",
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  body: {
    type: 'object',
    properties: {
      label: { type: 'string', minLength: 1 },
      metadata: { type: 'object', additionalProperties: true },
    },
  },
  response: {
    200: walletResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const getBalanceSchema = {
  description: "Fetch a wallet's stored balance (satoshis, decimal string)",
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        walletId: { type: 'string' },
        balanceCache: { type: 'string', pattern: SATS_BALANCE_PATTERN },
      },
      required: ['walletId', 'balanceCache'],
    },
    404: errorResponseSchema,
  },
} as const;

export const getTransactionHistorySchema = {
  description: "Fetch a wallet's transaction history",
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          walletId: { type: 'string' },
          txid: { type: ['string', 'null'] },
          type: { type: 'string', enum: ['send', 'receive', 'internal-transfer'] },
          amount: { type: 'string' },
          feeRate: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed'],
          },
          confirmations: { type: 'number' },
          rawTx: { type: ['string', 'null'] },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
    },
    404: errorResponseSchema,
  },
} as const;

const balanceResultSchema = {
  type: 'object',
  properties: {
    walletId: { type: 'string' },
    balanceCache: { type: 'string', pattern: SATS_BALANCE_PATTERN },
  },
  required: ['walletId', 'balanceCache'],
} as const;

export const depositSchema = {
  description:
    'Admin-only dev/test funding: credit a wallet (ledger reason `deposit`). Idempotent by `reference`.',
  tags: ['admin'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amountSats: { type: 'string', pattern: SATS_AMOUNT_PATTERN },
      reference: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9:._-]+$' },
    },
    required: ['amountSats', 'reference'],
    examples: [{ amountSats: '100000', reference: 'faucet-2026-10-31-001' }],
  },
  response: {
    200: balanceResultSchema,
    400: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

// --- Internal (service-to-service, x-service-token) ---

export const internalWalletSchema = {
  description: 'Service-only wallet summary used by transaction-service for explicit ownership/status checks',
  tags: ['internal'],
  params: walletParamsSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ownerUserId: { type: 'string' },
        status: { type: 'string', enum: walletStatusEnum },
        network: { type: 'string', enum: networkEnum },
        address: { type: 'string' },
      },
      required: ['id', 'ownerUserId', 'status', 'network', 'address'],
    },
    404: errorResponseSchema,
  },
} as const;

const movementBody = {
  transactionId: { type: 'string', pattern: OBJECT_ID_PATTERN },
  amountSats: { type: 'string', pattern: SATS_AMOUNT_PATTERN },
} as const;

export const internalDebitSchema = {
  description: 'Service-only guarded debit for a send. Idempotent by transactionId.',
  tags: ['internal'],
  params: walletParamsSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: movementBody,
    required: ['transactionId', 'amountSats'],
  },
  response: {
    200: balanceResultSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

export const internalCreditSchema = {
  description: 'Service-only refund credit for a failed send. Idempotent by transactionId.',
  tags: ['internal'],
  params: walletParamsSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { ...movementBody, reason: { type: 'string', enum: ['refund'] } },
    required: ['transactionId', 'amountSats', 'reason'],
  },
  response: {
    200: balanceResultSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;
