import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/** A readiness check resolves when the dependency is usable and rejects otherwise. */
export type ReadinessCheck = () => Promise<void>;

export interface HealthPluginOptions {
  /** Readiness checks run in parallel on every /readyz call. */
  checks?: ReadinessCheck[];
  /** Per-check timeout; a slow dependency counts as not ready. Default 2000ms. */
  checkTimeoutMs?: number;
}

const withTimeout = async (check: ReadinessCheck, timeoutMs: number): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`readiness check timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

// /healthz: liveness (process is up). /readyz: readiness (all injected dependency checks pass).
// Failure reasons are logged, never returned to the caller.
const healthPluginImpl: FastifyPluginAsync<HealthPluginOptions> = async (
  app: FastifyInstance,
  opts: HealthPluginOptions,
) => {
  const checks = opts.checks ?? [];
  const checkTimeoutMs = opts.checkTimeoutMs ?? 2000;

  app.get(
    '/healthz',
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/readyz',
    async (request, reply) => {
      const results = await Promise.allSettled(checks.map((check) => withTimeout(check, checkTimeoutMs)));
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failures.length > 0) {
        request.log.warn(
          { reasons: failures.map((f) => String((f.reason as Error)?.message ?? f.reason)) },
          'readiness check failed',
        );
        reply.status(503);
        return { status: 'not-ready' };
      }
      return { status: 'ok' };
    },
  );
};

export const healthPlugin = fp(healthPluginImpl, { name: 'zuma-health' });
