// Fastify JSON schemas for notification routes (request validation, additionalProperties: false).
const resultSchema = {
  type: 'object',
  properties: {
    channel: { type: 'string', enum: ['email', 'sms', 'slack', 'teams'] },
    status: { type: 'string', enum: ['accepted'] },
    providerMessageId: { type: 'string' },
  },
  required: ['channel', 'status'],
} as const;

const response = { 202: resultSchema } as const;
const tags = ['notifications'];

export const sendEmailSchema = {
  tags,
  summary: 'Send an email',
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['to', 'subject'],
    properties: {
      to: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', maxLength: 254 } },
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      text: { type: 'string', maxLength: 100000 },
      html: { type: 'string', maxLength: 100000 },
    },
  },
  response,
} as const;

export const sendSmsSchema = {
  tags,
  summary: 'Send an SMS',
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['to', 'body'],
    properties: {
      to: { type: 'string', maxLength: 16 },
      body: { type: 'string', minLength: 1, maxLength: 1600 },
    },
  },
  response,
} as const;

const chatBody = (withTitle: boolean) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: {
      target: { type: 'string', maxLength: 64 },
      text: { type: 'string', minLength: 1, maxLength: 4000 },
      ...(withTitle ? { title: { type: 'string', minLength: 1, maxLength: 200 } } : {}),
    },
  }) as const;

export const notifySlackSchema = { tags, summary: 'Post to a Slack channel', body: chatBody(false), response } as const;
export const notifyTeamsSchema = { tags, summary: 'Post to a Teams channel', body: chatBody(true), response } as const;
