import { loadYoneConfig } from '../src/config/yone-config';
import { testEnv } from './helpers';

const SID = `AC${'a'.repeat(32)}`;

describe('loadYoneConfig', () => {
  it('loads with only a service token and applies defaults', () => {
    const c = loadYoneConfig(testEnv());
    expect(c).toMatchObject({ PORT: 3005, SERVICE_NAME: 'yone', SLACK_WEBHOOK_URLS: {}, TEAMS_WEBHOOK_URLS: {} });
    expect(c.ALLOWED_SERVICE_TOKENS).toEqual(['test-service-token-0123456789abcdef']);
  });

  it('treats blank optional values as unset (op can inject empty fields)', () => {
    const c = loadYoneConfig(testEnv({ SENDGRID_API_KEY: '', EMAIL_FROM_ADDRESS: '  ', TWILIO_SMS_FROM: '' }));
    expect(c.SENDGRID_API_KEY).toBeUndefined();
  });

  it.each<[string, Record<string, string>, RegExp]>([
    ['email key without from', { SENDGRID_API_KEY: 'k' }, /email is partially configured/],
    ['twilio sid without token', { TWILIO_ACCOUNT_SID: SID }, /partially configured/],
    ['twilio creds without sender', { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: 't' }, /TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID/],
    ['bad slack json', { SLACK_WEBHOOK_URLS: '{nope' }, /JSON object/],
    ['slack map of non-urls', { SLACK_WEBHOOK_URLS: '{"a":"x"}' }, /map target names to URLs/],
    ['slack url on foreign host', { SLACK_WEBHOOK_URLS: '{"a":"https://evil.example/x"}' }, /disallowed host/],
    ['slack look-alike host', { SLACK_WEBHOOK_URLS: '{"a":"https://hooks.slack.com.evil.example/x"}' }, /disallowed host/],
    ['slack http url', { SLACK_WEBHOOK_URLS: '{"a":"http://hooks.slack.com/x"}' }, /disallowed host/],
    ['teams url on foreign host', { TEAMS_WEBHOOK_URLS: '{"a":"https://hooks.slack.com/x"}' }, /disallowed host/],
    ['empty tokens in production', { NODE_ENV: 'production', ALLOWED_SERVICE_TOKENS: ' , ' }, /must not be empty/],
    ['short service token', { ALLOWED_SERVICE_TOKENS: 'short' }, /at least 16 characters/],
  ])('rejects %s', (_name, env, message) => {
    expect(() => loadYoneConfig(testEnv(env))).toThrow(message);
  });

  it('accepts a fully configured environment', () => {
    const c = loadYoneConfig(
      testEnv({
        SENDGRID_API_KEY: 'k',
        EMAIL_FROM_ADDRESS: 'noreply@example.com',
        TWILIO_ACCOUNT_SID: SID,
        TWILIO_AUTH_TOKEN: 't',
        TWILIO_SMS_FROM: '+15005550006',
        SLACK_WEBHOOK_URLS: '{"default":"https://hooks.slack.com/services/T/B/x"}',
        TEAMS_WEBHOOK_URLS: '{"ops":"https://prod-1.westus.logic.azure.com:443/workflows/x"}',
      }),
    );
    expect(Object.keys(c.SLACK_WEBHOOK_URLS)).toEqual(['default']);
    expect(Object.keys(c.TEAMS_WEBHOOK_URLS)).toEqual(['ops']);
  });
});
