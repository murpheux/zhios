import { PrismaClient } from '@prisma/client';
import { recordPrismaQuery } from './newrelic';

interface QueryEvent {
  duration: number;
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
    log: [{ emit: 'event', level: 'query' }],
  });
  // Query events carry duration only (never params) into the metric; the agent has no Prisma instrumentation.
  (client as unknown as { $on(event: 'query', cb: (e: QueryEvent) => void): void }).$on('query', (e) =>
    recordPrismaQuery(e.duration),
  );
  return client;
}
