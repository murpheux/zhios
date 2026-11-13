import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import type { FastifyInstance } from 'fastify';

/** Must be registered before any route so @fastify/swagger can collect them. */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'ozzo API',
        description: 'Subscription account management: users, bank accounts, wallet sync',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Okta access token' },
        },
      },
      tags: [
        { name: 'users' },
        { name: 'accounts' },
        { name: 'wallet' },
        { name: 'ops' },
      ],
    },
  });

  await app.register(scalar, {
    routePrefix: '/docs',
    configuration: { title: 'ozzo API', url: '/openapi.json' },
  });

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
}
