// Fastify JSON schemas for wallet routes; doubles as the OpenAPI source for @fastify/swagger.
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
    balanceCache: { type: 'string' },
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
  properties: { id: { type: 'string', minLength: 1 } },
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
    404: errorResponseSchema,
  },
} as const;

export const getBalanceSchema = {
  description: "Fetch a wallet's cached balance",
  tags: ['wallets'],
  security: [{ bearerAuth: [] }],
  params: walletParamsSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        walletId: { type: 'string' },
        balanceCache: { type: 'string' },
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
            enum: ['pending', 'signed', 'broadcast', 'confirmed', 'failed', 'rejected'],
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
