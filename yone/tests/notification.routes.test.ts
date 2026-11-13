import { UpstreamError } from '../src/domain/errors';
import { ChannelNotConfiguredError } from '../src/domain/notification';
import { providersFromConfig } from '../src/app';
import { loadYoneConfig } from '../src/config/yone-config';
import { SendGridEmailSender } from '../src/infrastructure/providers/sendgrid-email.sender';
import { TwilioSmsSender } from '../src/infrastructure/providers/twilio-sms.sender';
import { SlackWebhookNotifier } from '../src/infrastructure/providers/slack-webhook.notifier';
import { TeamsWebhookNotifier } from '../src/infrastructure/providers/teams-webhook.notifier';
import { buildTestApp, mockProviders, SERVICE_TOKEN, testEnv } from './helpers';

type Harness = Awaited<ReturnType<typeof buildTestApp>>;

describe('notification routes', () => {
  let h: Harness;
  let providers: ReturnType<typeof mockProviders>;

  beforeEach(async () => {
    providers = mockProviders();
    h = await buildTestApp(providers);
  });
  afterEach(() => h.app.close());

  const post = (path: string, payload: unknown, headers: Record<string, string> = h.serviceHeaders()) =>
    h.app.inject({ method: 'POST', url: `/api/v1/notifications/${path}`, headers, payload: payload as object });

  const valid: Array<[string, object, string]> = [
    ['email', { to: ['a@example.com'], subject: 'S', text: 't' }, 'email'],
    ['sms', { to: '+14035550123', body: 'hi' }, 'sms'],
    ['slack', { text: 'hi' }, 'slack'],
    ['teams', { text: 'hi', title: 'T' }, 'teams'],
  ];

  it.each(valid)('POST /%s returns 202 for an allow-listed service caller', async (path, payload, channel) => {
    const res = await post(path, payload);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ channel, status: 'accepted' });
  });

  it.each(valid)('POST /%s rejects missing or invalid service tokens', async (path, payload) => {
    expect((await post(path, payload, {})).statusCode).toBe(401);
    expect((await post(path, payload, h.serviceHeaders('a.b.c'))).statusCode).toBe(401);
    expect((await post(path, payload, h.serviceHeaders(`${SERVICE_TOKEN}x`))).statusCode).toBe(401);
  });

  it('accepts any token on the allow-list', async () => {
    const multi = await buildTestApp(mockProviders(), { ALLOWED_SERVICE_TOKENS: `${'a'.repeat(16)}, ${'b'.repeat(16)}` });
    const res = await multi.app.inject({
      method: 'POST',
      url: '/api/v1/notifications/slack',
      headers: multi.serviceHeaders('b'.repeat(16)),
      payload: { text: 'hi' },
    });
    expect(res.statusCode).toBe(202);
    await multi.app.close();
  });

  it('rejects every call when the allow-list is empty', async () => {
    const none = await buildTestApp(mockProviders(), { ALLOWED_SERVICE_TOKENS: '' });
    const res = await none.app.inject({
      method: 'POST',
      url: '/api/v1/notifications/slack',
      headers: none.serviceHeaders(''),
      payload: { text: 'hi' },
    });
    expect(res.statusCode).toBe(401);
    await none.app.close();
  });

  it('never calls a provider when auth fails', async () => {
    await post('email', (valid[0] as [string, object, string])[1], {});
    await post('sms', (valid[1] as [string, object, string])[1], h.serviceHeaders('wrong-token-0123456789'));
    expect(providers.email.send).not.toHaveBeenCalled();
    expect(providers.sms.send).not.toHaveBeenCalled();
  });

  it.each([
    ['email', { to: ['a@example.com'] }],
    ['email', { to: ['bad'], subject: 'S', text: 't' }],
    ['sms', { to: '12345', body: 'x' }],
    ['slack', { text: '' }],
    ['teams', { target: 'x'.repeat(65), text: 'x' }],
  ])('POST /%s returns 400 for invalid payload %j', async (path, payload) => {
    const res = await post(path, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('strips unknown properties so callers cannot inject a webhook URL', async () => {
    const res = await post('slack', { text: 'x', webhookUrl: 'https://evil.example' });
    expect(res.statusCode).toBe(202);
    expect(providers.slack.post).toHaveBeenCalledWith({ target: 'default', text: 'x' });
  });

  it('maps provider failures to a stable 502/503/504 without leaking details', async () => {
    providers.sms.send.mockRejectedValue(new UpstreamError('twilio', 'UPSTREAM_TIMEOUT', new Error('sid ACxxx')));
    const res = await post('sms', (valid[1] as [string, object, string])[1]);
    expect(res.statusCode).toBe(504);
    expect(res.json().code).toBe('UPSTREAM_TIMEOUT');
    expect(res.body).not.toContain('ACxxx');
  });

  it('returns 503 CHANNEL_NOT_CONFIGURED for an unconfigured channel', async () => {
    providers.slack.post.mockRejectedValue(new ChannelNotConfiguredError('slack'));
    const res = await post('slack', { text: 'hi' });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('CHANNEL_NOT_CONFIGURED');
  });

  it('exposes health probes without auth', async () => {
    for (const url of ['/healthz', '/readyz']) {
      const res = await h.app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    }
  });

  it('sets security headers', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('providersFromConfig', () => {
  it('uses unconfigured adapters by default and real adapters when configured', async () => {
    const bare = providersFromConfig(loadYoneConfig(testEnv()));
    await expect(bare.email.send({ to: [], subject: '' })).rejects.toBeInstanceOf(ChannelNotConfiguredError);

    const full = providersFromConfig(
      loadYoneConfig(
        testEnv({
          SENDGRID_API_KEY: 'k',
          EMAIL_FROM_ADDRESS: 'noreply@example.com',
          TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
          TWILIO_AUTH_TOKEN: 't',
          TWILIO_SMS_FROM: '+15005550006',
          SLACK_WEBHOOK_URLS: '{"default":"https://hooks.slack.com/services/T/B/x"}',
          TEAMS_WEBHOOK_URLS: '{"default":"https://x.webhook.office.com/y"}',
        }),
      ),
    );
    expect(full.email).toBeInstanceOf(SendGridEmailSender);
    expect(full.sms).toBeInstanceOf(TwilioSmsSender);
    expect(full.slack).toBeInstanceOf(SlackWebhookNotifier);
    expect(full.teams).toBeInstanceOf(TeamsWebhookNotifier);
  });
});
