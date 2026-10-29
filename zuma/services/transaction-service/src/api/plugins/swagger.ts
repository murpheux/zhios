import fp from 'fastify-plugin';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const readServiceVersion = (): string => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
};

// Registers OpenAPI generation (@fastify/swagger) and the /docs UI.
const swaggerPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Transaction Service API',
        version: readServiceVersion(),
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });
};

export default fp(swaggerPlugin, { name: 'zuma-swagger' });
