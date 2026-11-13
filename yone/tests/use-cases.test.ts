import { ValidationError } from '../src/domain/errors';
import { SendEmailUseCase } from '../src/application/use-cases/send-email.use-case';
import { SendSmsUseCase } from '../src/application/use-cases/send-sms.use-case';
import { NotifySlackUseCase } from '../src/application/use-cases/notify-slack.use-case';
import { NotifyTeamsUseCase } from '../src/application/use-cases/notify-teams.use-case';
import { mockProviders } from './helpers';

describe('SendEmailUseCase', () => {
  const setup = () => {
    const p = mockProviders();
    return { p, useCase: new SendEmailUseCase(p.email) };
  };

  it('sends to a de-duplicated, trimmed recipient list and returns the receipt', async () => {
    const { p, useCase } = setup();
    const result = await useCase.execute({
      to: [' a@example.com ', 'a@example.com', 'b@example.com'],
      subject: 'Hello\r\nBcc: evil@example.com',
      text: 'hi',
    });
    expect(p.email.send).toHaveBeenCalledWith({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Hello Bcc: evil@example.com',
      text: 'hi',
      html: undefined,
    });
    expect(result).toEqual({ channel: 'email', status: 'accepted', providerMessageId: 'sg-1' });
  });

  it.each<[string, Parameters<SendEmailUseCase['execute']>[0]]>([
    ['no recipients', { to: [], subject: 's', text: 't' }],
    ['too many recipients', { to: Array.from({ length: 51 }, (_, i) => `u${i}@example.com`), subject: 's', text: 't' }],
    ['invalid address', { to: ['not-an-email'], subject: 's', text: 't' }],
    ['no body', { to: ['a@example.com'], subject: 's' }],
    ['blank subject', { to: ['a@example.com'], subject: '  ', text: 't' }],
    ['blank text', { to: ['a@example.com'], subject: 's', text: ' ' }],
  ])('rejects %s without calling the provider', async (_name, request) => {
    const { p, useCase } = setup();
    await expect(useCase.execute(request)).rejects.toBeInstanceOf(ValidationError);
    expect(p.email.send).not.toHaveBeenCalled();
  });

  it('propagates provider failures', async () => {
    const { p, useCase } = setup();
    p.email.send.mockRejectedValue(new Error('boom'));
    await expect(useCase.execute({ to: ['a@example.com'], subject: 's', html: '<p>x</p>' })).rejects.toThrow('boom');
  });
});

describe('SendSmsUseCase', () => {
  it('sends to an E.164 number', async () => {
    const p = mockProviders();
    const result = await new SendSmsUseCase(p.sms).execute({ to: '+14035550123', body: 'code 123' });
    expect(p.sms.send).toHaveBeenCalledWith({ to: '+14035550123', body: 'code 123' });
    expect(result).toEqual({ channel: 'sms', status: 'accepted', providerMessageId: 'SM1' });
  });

  it.each([['4035550123'], ['+0123456789'], ['+1 403 555 0123'], ['+123']])('rejects phone %s', async (to) => {
    const p = mockProviders();
    await expect(new SendSmsUseCase(p.sms).execute({ to, body: 'x' })).rejects.toBeInstanceOf(ValidationError);
    expect(p.sms.send).not.toHaveBeenCalled();
  });

  it('rejects a body over the limit', async () => {
    const p = mockProviders();
    await expect(
      new SendSmsUseCase(p.sms).execute({ to: '+14035550123', body: 'x'.repeat(1601) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.each([
  ['slack', (p: ReturnType<typeof mockProviders>) => new NotifySlackUseCase(p.slack), 'slack'],
  ['teams', (p: ReturnType<typeof mockProviders>) => new NotifyTeamsUseCase(p.teams), 'teams'],
] as const)('%s use-case', (_name, build, key) => {
  it('defaults the target and returns accepted', async () => {
    const p = mockProviders();
    const result = await build(p).execute({ text: 'deploy done' });
    expect(p[key].post).toHaveBeenCalledWith(expect.objectContaining({ target: 'default', text: 'deploy done' }));
    expect(result).toEqual({ channel: key, status: 'accepted' });
  });

  it.each([['https://evil.example/x'], ['Bad Name'], ['../x']])('rejects target %s', async (target) => {
    const p = mockProviders();
    await expect(build(p).execute({ text: 'x', target })).rejects.toBeInstanceOf(ValidationError);
    expect(p[key].post).not.toHaveBeenCalled();
  });

  it('rejects blank text', async () => {
    const p = mockProviders();
    await expect(build(p).execute({ text: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('NotifyTeamsUseCase title', () => {
  it('passes a valid title and rejects a blank one', async () => {
    const p = mockProviders();
    const useCase = new NotifyTeamsUseCase(p.teams);
    await useCase.execute({ text: 'x', title: 'Alert', target: 'ops' });
    expect(p.teams.post).toHaveBeenCalledWith({ target: 'ops', text: 'x', title: 'Alert' });
    await expect(useCase.execute({ text: 'x', title: ' ' })).rejects.toBeInstanceOf(ValidationError);
  });
});
