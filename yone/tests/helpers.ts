import pino from 'pino';
import { buildApp, type NotificationProviders } from '../src/app';
import { loadYoneConfig } from '../src/config/yone-config';

export const SERVICE_TOKEN = 'test-service-token-0123456789abcdef';

export const testEnv = (overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  ALLOWED_SERVICE_TOKENS: SERVICE_TOKEN,
  NODE_ENV: 'test',
  ...overrides,
});

export const mockProviders = (): {
  [K in keyof NotificationProviders]: { [M in keyof NotificationProviders[K]]: jest.Mock };
} => ({
  email: { send: jest.fn().mockResolvedValue({ providerMessageId: 'sg-1' }) },
  sms: { send: jest.fn().mockResolvedValue({ providerMessageId: 'SM1' }) },
  slack: { post: jest.fn().mockResolvedValue(undefined) },
  teams: { post: jest.fn().mockResolvedValue(undefined) },
});

export const buildTestApp = async (
  providers: ReturnType<typeof mockProviders>,
  envOverrides: Record<string, string | undefined> = {},
) => {
  const config = loadYoneConfig(testEnv(envOverrides));
  const app = await buildApp({
    config,
    logger: pino({ level: 'silent' }),
    providers: providers as unknown as NotificationProviders,
  });
  await app.ready();
  const serviceHeaders = (token = SERVICE_TOKEN) => ({ 'x-service-token': token });
  return { app, config, serviceHeaders };
};

export const jsonResponse = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
