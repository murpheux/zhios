// Must be the first import of index.ts (before ./otel): the New Relic agent only instruments
// modules loaded after it. No-op unless NEW_RELIC_ENABLED=true and NEW_RELIC_LICENSE_KEY are set.
import { initNewRelic } from '@zuma/shared-logging';

initNewRelic(process.env.NEW_RELIC_APP_NAME || 'wallet-service');
