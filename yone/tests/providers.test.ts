import { UpstreamError, ValidationError } from '../src/domain/errors';
import { SendGridEmailSender } from '../src/infrastructure/providers/sendgrid-email.sender';
import { TwilioSmsSender } from '../src/infrastructure/providers/twilio-sms.sender';
import { SlackWebhookNotifier } from '../src/infrastructure/providers/slack-webhook.notifier';
import { TeamsWebhookNotifier } from '../src/infrastructure/providers/teams-webhook.notifier';
import { ChannelNotConfiguredError } from '../src/domain/notification';
import {
  unconfiguredChat,
  unconfiguredEmail,
  unconfiguredSms,
} from '../src/infrastructure/providers/unconfigured';
import { jsonResponse } from './helpers';

// All fixtures are obviously fake placeholders; no network is touched (fetch is injected).
const fakeFetch = (response: Response | Error) =>
  jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });

const call = (f: jest.Mock) => {
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string>, body: String(init.body) };
};

describe('SendGridEmailSender', () => {
  const build = (f: jest.Mock) =>
    new SendGridEmailSender({ apiKey: 'test-key', fromAddress: 'noreply@example.com', fromName: 'Zuma', timeoutMs: 1000, fetchImpl: f });

  it('posts a v3 mail payload and returns x-message-id', async () => {
    const f = fakeFetch(new Response(null, { status: 202, headers: { 'x-message-id': 'abc' } }));
    const receipt = await build(f).send({ to: ['a@example.com', 'b@example.com'], subject: 'S', text: 't', html: '<b>h</b>' });
    const { url, headers, body } = call(f);
    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect(headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(body)).toEqual({
      personalizations: [{ to: [{ email: 'a@example.com' }] }, { to: [{ email: 'b@example.com' }] }],
      from: { email: 'noreply@example.com', name: 'Zuma' },
      subject: 'S',
      content: [
        { type: 'text/plain', value: 't' },
        { type: 'text/html', value: '<b>h</b>' },
      ],
    });
    expect(receipt).toEqual({ providerMessageId: 'abc' });
  });

  it.each([
    [401, 'UPSTREAM_ERROR'],
    [429, 'UPSTREAM_UNAVAILABLE'],
    [503, 'UPSTREAM_UNAVAILABLE'],
  ])('maps provider status %i to %s without leaking the body', async (status, code) => {
    const f = fakeFetch(jsonResponse(status, { errors: [{ message: 'secret-detail' }] }));
    const err = await build(f).send({ to: ['a@example.com'], subject: 'S', text: 't' }).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('secret-detail');
  });

  it('maps timeouts and network failures', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    await expect(build(fakeFetch(timeout)).send({ to: ['a@example.com'], subject: 'S', text: 't' })).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
    });
    await expect(build(fakeFetch(new TypeError('fetch failed'))).send({ to: ['a@example.com'], subject: 'S', text: 't' })).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });
});

describe('TwilioSmsSender', () => {
  const base = { accountSid: `AC${'0'.repeat(32)}`, authToken: 'test-token', timeoutMs: 1000 };

  it('posts a form with basic auth and returns the message sid', async () => {
    const f = fakeFetch(jsonResponse(201, { sid: 'SM123' }));
    const receipt = await new TwilioSmsSender({ ...base, from: '+15005550006', fetchImpl: f }).send({ to: '+14035550123', body: 'hi' });
    const { url, headers, body } = call(f);
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${base.accountSid}/Messages.json`);
    expect(headers.authorization).toBe(`Basic ${Buffer.from(`${base.accountSid}:test-token`).toString('base64')}`);
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ To: '+14035550123', Body: 'hi', From: '+15005550006' });
    expect(receipt).toEqual({ providerMessageId: 'SM123' });
  });

  it('prefers a messaging service sid and tolerates a non-JSON body', async () => {
    const f = fakeFetch(new Response('ok', { status: 201 }));
    const receipt = await new TwilioSmsSender({ ...base, messagingServiceSid: `MG${'1'.repeat(32)}`, fetchImpl: f }).send({ to: '+14035550123', body: 'hi' });
    expect(Object.fromEntries(new URLSearchParams(call(f).body))).toMatchObject({ MessagingServiceSid: `MG${'1'.repeat(32)}` });
    expect(receipt).toEqual({ providerMessageId: undefined });
  });

  it('requires a sender identity', () => {
    expect(() => new TwilioSmsSender(base)).toThrow('from or messagingServiceSid');
  });

  it('maps a 4xx to UPSTREAM_ERROR', async () => {
    const sender = new TwilioSmsSender({ ...base, from: '+15005550006', fetchImpl: fakeFetch(jsonResponse(400)) });
    await expect(sender.send({ to: '+14035550123', body: 'hi' })).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});

describe('chat notifiers', () => {
  const slackUrl = 'https://hooks.slack.com/services/TEST/TEST/placeholder';
  const teamsUrl = 'https://example.webhook.office.com/webhookb2/placeholder';

  it('slack posts {text} to the resolved target', async () => {
    const f = fakeFetch(new Response('ok'));
    await new SlackWebhookNotifier({ targets: { default: slackUrl }, timeoutMs: 1000, fetchImpl: f }).post({ target: 'default', text: 'hi' });
    const { url, body } = call(f);
    expect(url).toBe(slackUrl);
    expect(JSON.parse(body)).toEqual({ text: 'hi' });
  });

  it('teams posts an adaptive card, with optional title', async () => {
    const f = fakeFetch(new Response('1'));
    const notifier = new TeamsWebhookNotifier({ targets: { ops: teamsUrl }, timeoutMs: 1000, fetchImpl: f });
    await notifier.post({ target: 'ops', text: 'hi', title: 'T' });
    const card = JSON.parse(call(f).body).attachments[0];
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.body.map((b: { text: string }) => b.text)).toEqual(['T', 'hi']);

    const g = fakeFetch(new Response('1'));
    await new TeamsWebhookNotifier({ targets: { ops: teamsUrl }, timeoutMs: 1000, fetchImpl: g }).post({ target: 'ops', text: 'only' });
    expect(JSON.parse(call(g).body).attachments[0].content.body).toHaveLength(1);
  });

  it.each(['missing', 'constructor', '__proto__'])('rejects unknown target %s without calling out', async (target) => {
    const f = fakeFetch(new Response('ok'));
    await expect(
      new SlackWebhookNotifier({ targets: { default: slackUrl }, timeoutMs: 1000, fetchImpl: f }).post({ target, text: 'x' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(f).not.toHaveBeenCalled();
  });

  it('does not follow redirects', async () => {
    const f = fakeFetch(new Response('ok'));
    await new SlackWebhookNotifier({ targets: { default: slackUrl }, timeoutMs: 1000, fetchImpl: f }).post({ target: 'default', text: 'x' });
    expect(call(f).init.redirect).toBe('error');
  });
});

describe('unconfigured adapters', () => {
  it('reject with ChannelNotConfiguredError (503)', async () => {
    const errors = await Promise.all([
      unconfiguredEmail().send({ to: [], subject: '' }).catch((e) => e),
      unconfiguredSms().send({ to: '', body: '' }).catch((e) => e),
      unconfiguredChat('slack').post({ target: 'default', text: '' }).catch((e) => e),
    ]);
    for (const e of errors) {
      expect(e).toBeInstanceOf(ChannelNotConfiguredError);
      expect(e.httpStatus).toBe(503);
    }
  });
});
