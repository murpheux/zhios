import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { mapErrorToHttp } from '@zuma/shared-common';

// Shared Fastify error handler: schema-validation failures → 400, domain/4xx errors → their
// status with {statusCode, code, message}, everything else → opaque 500 (logged, never echoed).
export const errorHandler = (
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void => {
  if ('validation' in error && error.validation) {
    reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: error.message });
    return;
  }
  const body = mapErrorToHttp(error);
  if (body.statusCode >= 500) {
    request.log.error({ err: error }, 'unhandled error');
  }
  reply.status(body.statusCode).send(body);
};
