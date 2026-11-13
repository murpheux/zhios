import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { Logger } from 'pino';
import type { YoneConfig } from '../../config/yone-config';
import { DomainError, UPSTREAM_MESSAGES, UpstreamError } from '../../domain/errors';

export const platformServerOptions = (
  config: YoneConfig,
): Pick<FastifyServerOptions, 'bodyLimit' | 'connectionTimeout' | 'requestTimeout' | 'trustProxy'> => ({
  bodyLimit: config.HTTP_BODY_LIMIT_BYTES,
  connectionTimeout: config.HTTP_CONNECTION_TIMEOUT_MS,
  requestTimeout: config.HTTP_REQUEST_TIMEOUT_MS,
  trustProxy: config.TRUST_PROXY,
});

// 400 for schema validation, domain errors keep their own status/code, other 4xx pass through,
// everything else is an opaque 500 (logged, never echoed).
export const errorHandler = (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void => {
  if ('validation' in error && error.validation) {
    void reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: error.message });
    return;
  }
  if (error instanceof UpstreamError) {
    void reply.status(error.httpStatus).send({
      statusCode: error.httpStatus,
      code: error.code,
      message: UPSTREAM_MESSAGES[error.code],
    });
    return;
  }
  if (error instanceof DomainError) {
    // "channel not configured" is an operator-facing 503 with a client-safe message; other 5xx are opaque.
    const opaque = error.httpStatus >= 500 && error.code !== 'CHANNEL_NOT_CONFIGURED';
    if (opaque) request.log.error({ err: error }, 'unhandled error');
    const details = (error as { details?: Record<string, unknown> }).details;
    void reply.status(error.httpStatus).send({
      statusCode: error.httpStatus,
      code: opaque ? 'INTERNAL_ERROR' : error.code,
      message: opaque ? 'An unexpected error occurred' : error.message,
      ...(details && !opaque ? { details } : {}),
    });
    return;
  }
  const status = (error as { statusCode?: unknown }).statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    void reply.status(status).send({
      statusCode: status,
      code: status === 429 ? 'RATE_LIMITED' : status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
      message: error.message || 'Bad request',
    });
    return;
  }
  request.log.error({ err: error }, 'unhandled error');
  void reply.status(500).send({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
};

// Helmet, CORS allowlist, rate limit, probes and the error handler. Readiness has no checks
// (stateless; provider reachability is deliberately not probed so a Slack outage can't pull the pod).
export const registerPlatform = async (
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, Logger>,
  config: YoneConfig,
): Promise<void> => {
  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ALLOWED_ORIGINS, methods: ['GET', 'POST'] });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: config.RATE_LIMIT_WINDOW });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/readyz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  app.setErrorHandler(errorHandler);
};
