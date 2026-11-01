// Must be the first import of index.ts: auto-instrumentation only patches modules required after it.
import { startOtelFromEnv } from '@zuma/shared-observability';

startOtelFromEnv('transaction-service');
