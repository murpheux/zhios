// Fastify JSON schemas for transaction routes; doubles as the OpenAPI source for @fastify/swagger.
const transactionKindEnum = ['send', 'receive'];
const transactionStatusEnum = ['pending', 'broadcast', 'confirmed', 'failed'];

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

export const transactionResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    walletId: { type: 'string' },
    txid: { type: ['string', 'null'] },
    type: { type: 'string', enum: transactionKindEnum },
    amount: { type: 'string' },
    feeRate: { type: 'string' },
    status: { type: 'string', enum: transactionStatusEnum },
    confirmations: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'walletId',
    'txid',
    'type',
    'amount',
    'feeRate',
    'status',
    'confirmations',
    'createdAt',
    'updatedAt',
  ],
  // rawTx is intentionally omitted — it's internal and must never leave the service via the API.
} as const;

export const transactionParamsSchema = {
  type: 'object',
  properties: { id: { type: 'string', minLength: 1 } },
  required: ['id'],
} as const;

export const createTransactionSchema = {
  description: 'Create (build + sign) a new transaction. Supports a client-supplied Idempotency-Key header to make retries safe.',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  headers: {
    type: 'object',
    properties: {
      'idempotency-key': { type: 'string', description: 'Unique key; replays with the same key return the original transaction' },
    },
  },
  body: {
    type: 'object',
    properties: {
      walletId: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: transactionKindEnum },
      amount: { type: 'string', minLength: 1 },
      feeRate: { type: 'string', minLength: 1 },
      destinationAddress: { type: 'string', minLength: 1 },
    },
    required: ['walletId', 'type', 'amount', 'feeRate', 'destinationAddress'],
    examples: [
      {
        walletId: '6710f1f1c2a1b2c3d4e5f6a7',
        type: 'send',
        amount: '0.001',
        feeRate: '12',
        destinationAddress: 'tb1q...',
      },
    ],
  },
  response: {
    201: transactionResponseSchema,
    400: errorResponseSchema,
  },
} as const;

export const getTransactionSchema = {
  description: 'Fetch a transaction by id',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  params: transactionParamsSchema,
  response: {
    200: {
      ...transactionResponseSchema,
      examples: [
        {
          id: '6710f1f1c2a1b2c3d4e5f6a8',
          walletId: '6710f1f1c2a1b2c3d4e5f6a7',
          txid: null,
          type: 'send',
          amount: '0.001',
          feeRate: '12',
          status: 'pending',
          confirmations: 0,
          rawTx: 'rawtx:...:signed',
          createdAt: '2024-10-13T12:00:00.000Z',
          updatedAt: '2024-10-13T12:00:00.000Z',
        },
      ],
    },
    404: errorResponseSchema,
  },
} as const;

export const listTransactionsSchema = {
  description: 'List transactions with filters and pagination',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      walletId: { type: 'string' },
      status: { type: 'string', enum: transactionStatusEnum },
      from: { type: 'string', format: 'date-time' },
      to: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        items: { type: 'array', items: transactionResponseSchema },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
      required: ['items', 'total', 'page', 'limit', 'totalPages'],
    },
  },
} as const;

export const validateTransactionSchema = {
  description: 'Validate a pending transaction is ready to broadcast',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  params: transactionParamsSchema,
  response: {
    200: transactionResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const broadcastTransactionSchema = {
  description: 'Broadcast a validated transaction to the network',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  params: transactionParamsSchema,
  response: {
    200: transactionResponseSchema,
    400: errorResponseSchema,
    404: errorResponseSchema,
  },
} as const;

export const getTransactionStatusSchema = {
  description: "Fetch a transaction's confirmation status",
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  params: transactionParamsSchema,
  response: {
    200: {
      type: 'object',
      properties: {
        transactionId: { type: 'string' },
        status: { type: 'string', enum: transactionStatusEnum },
        confirmations: { type: 'number' },
      },
      required: ['transactionId', 'status', 'confirmations'],
    },
    404: errorResponseSchema,
  },
} as const;
