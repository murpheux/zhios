import type { FastifyError, FastifyInstance } from 'fastify';
import { DomainError } from '../../domain';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.setErrorHandler((err: FastifyError | DomainError, request, reply) => {
    if (err instanceof DomainError) {
      if (err.status >= 500) request.log.error({ err }, 'upstream/domain failure');
      return reply
        .code(err.status)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const fe = err as FastifyError;
    if (fe.validation) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: fe.message } });
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.code(fe.statusCode).send({ error: { code: fe.code ?? 'BAD_REQUEST', message: fe.message } });
    }
    request.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
}
