import { Pool } from 'pg';
import type { Logger } from 'pino';
import type { PoolClient, QueryResult } from 'pg';

/**
 * PostgreSQL connection pool factory and lifecycle management.
 * Use createConnectionPool to initialize, and releasePool to clean up.
 */
export const createConnectionPool = (connectionString: string, logger?: Logger): Pool => {
  const pool = new Pool({ connectionString });

  pool.on('error', (error: unknown) => {
    logger?.error({ error }, 'Unexpected error in PostgreSQL client pool');
  });

  pool.on('connect', () => {
    logger?.debug('Client connected to PostgreSQL');
  });

  pool.on('remove', () => {
    logger?.debug('Client removed from pool');
  });

  return pool;
};

/**
 * Release all connections in the pool and wait for termination.
 * Safe to call even if pool is already closed.
 */
export const releasePool = async (pool: Pool): Promise<void> => {
  await pool.end();
};

/**
 * Simple health check: verify connectivity and query a system catalog.
 */
export const healthCheck = async (pool: Pool): Promise<boolean> => {
  try {
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch {
    return false;
  }
};

/**
 * Run a query with a timeout. Useful for detecting hung connections.
 */
export const queryWithTimeout = async (
  client: PoolClient | Pool,
  query: string,
  values?: unknown[],
  timeoutMs = 10000,
): Promise<QueryResult<unknown>> => {
  const timeout = setTimeout(() => {
    throw new Error(`Query timeout after ${timeoutMs}ms`);
  }, timeoutMs);

  try {
    const result = await client.query(query, values);
    clearTimeout(timeout);
    return result;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};
