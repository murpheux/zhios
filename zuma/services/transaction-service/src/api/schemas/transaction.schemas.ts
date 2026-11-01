// Fastify JSON schemas for transaction routes; doubles as the OpenAPI source for @fastify/swagger.
import { OBJECT_ID_PATTERN, SATS_AMOUNT_PATTERN, SATS_BALANCE_PATTERN } from '@zuma/shared-common';
import { BITCOIN_ADDRESS_SHAPE_PATTERN } from '../../domain/value-objects/bitcoin-address';
import { IDEMPOTENCY_KEY_PATTERN } from '../../application/use-cases/create-transaction.use-case';

const transactionKindEnum = ['send', 'receive', 'internal-transfer'];
const transactionStatusEnum = ['pending', 'broadcasting', 'broadcast', 'confirmed', 'failed'];
// sat/vB, 1..10000, kept as a decimal string (the historical wire type).
const FEE_RATE_PATTERN = '^([1-9][0-9]{0,3}|10000)$';

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
    amount: { type: 'string', description: 'Satoshis' },
    feeRate: { type: 'string', description: 'sat/vB' },
    feeSats: { type: 'string', pattern: SATS_BALANCE_PATTERN, description: 'Total fee in satoshis' },
    destinationAddress: { type: 'string' },
    status: { type: 'string', enum: transactionStatusEnum },
    failureReason: { type: ['string', 'null'] },
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
  properties: { id: { type: 'string', pattern: OBJECT_ID_PATTERN } },
  required: ['id'],
} as const;

export const createTransactionSchema = {
  description:
    'Create (build + sign) a send and debit amount + fee from the wallet. Requires an Idempotency-Key header; replays with the same key and body return the original transaction.',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  headers: {
    type: 'object',
    properties: {
      'idempotency-key': {
        type: 'string',
        pattern: IDEMPOTENCY_KEY_PATTERN,
        description: 'Required. Unique per request; replays with the same key return the original transaction',
      },
    },
    required: ['idempotency-key'],
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      walletId: { type: 'string', pattern: OBJECT_ID_PATTERN },
      // Only sends originate from the API; receives are recorded by chain observation.
      type: { type: 'string', enum: ['send'] },
      amount: { type: 'string', pattern: SATS_AMOUNT_PATTERN, description: 'Satoshis' },
      feeRate: { type: 'string', pattern: FEE_RATE_PATTERN, description: 'sat/vB, 1..10000' },
      // Shape only here; the network-specific (bech32/bech32m checksum) check runs against the wallet's network.
      destinationAddress: { type: 'string', maxLength: 90, pattern: BITCOIN_ADDRESS_SHAPE_PATTERN },
    },
    required: ['walletId', 'type', 'amount', 'feeRate', 'destinationAddress'],
    examples: [
      {
        walletId: '6710f1f1c2a1b2c3d4e5f6a7',
        type: 'send',
        amount: '100000',
        feeRate: '12',
        destinationAddress: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      },
    ],
  },
  response: {
    201: transactionResponseSchema,
    400: errorResponseSchema,
    403: errorResponseSchema,
    409: errorResponseSchema,
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
          amount: '100000',
          feeRate: '12',
          feeSats: '1692',
          destinationAddress: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
          status: 'pending',
          failureReason: null,
          confirmations: 0,
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
      walletId: { type: 'string', pattern: OBJECT_ID_PATTERN },
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
  description:
    'Broadcast a funded pending transaction (owner only). Node rejection marks it failed and refunds the wallet.',
  tags: ['transactions'],
  security: [{ bearerAuth: [] }],
  params: transactionParamsSchema,
  response: {
    200: transactionResponseSchema,
    400: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
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
