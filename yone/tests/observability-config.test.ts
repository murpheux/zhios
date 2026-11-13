import { loadYoneConfig } from '../src/config/yone-config';
import { testEnv } from './helpers';

describe('observability config', () => {
  it('defaults: no file logging in development, no New Relic', () => {
    const c = loadYoneConfig(testEnv({ NODE_ENV: 'development' }));
    expect(c).toMatchObject({
      LOG_TO_FILE: false,
      NEW_RELIC_ENABLED: false,
      NEWRELIC_LOGS_ENABLED: false,
      LOG_FILE_MAX_SIZE: 10_485_760,
      LOG_FILE_ROTATE_DAYS: 7,
    });
  });

  it('file logging defaults on in production and can be overridden', () => {
    expect(loadYoneConfig(testEnv({ NODE_ENV: 'production' })).LOG_TO_FILE).toBe(true);
    expect(loadYoneConfig(testEnv({ NODE_ENV: 'production', LOG_TO_FILE: 'false' })).LOG_TO_FILE).toBe(false);
  });

  it.each([{ NEW_RELIC_ENABLED: 'true' }, { NEWRELIC_LOGS_ENABLED: 'true' }])(
    'requires a license key for %j',
    (extra) => {
      expect(() => loadYoneConfig(testEnv(extra))).toThrow(/NEW_RELIC_LICENSE_KEY/);
      expect(loadYoneConfig(testEnv({ ...extra, NEW_RELIC_LICENSE_KEY: 'k'.repeat(40) }))).toBeDefined();
    },
  );
});
