import fp from 'fastify-plugin';
import mongoose from 'mongoose';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

// Liveness and readiness probes; readiness checks the Mongoose connection state.
const healthPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get(
    '/healthz',
    { schema: { description: 'Liveness probe', tags: ['health'] } },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/readyz',
    { schema: { description: 'Readiness probe', tags: ['health'] } },
    async (_request, reply) => {
      const ready = mongoose.connection.readyState === 1;
      reply.status(ready ? 200 : 503);
      return { status: ready ? 'ok' : 'not-ready', mongoState: mongoose.connection.readyState };
    },
  );
};

export default fp(healthPlugin, { name: 'zuma-health' });
