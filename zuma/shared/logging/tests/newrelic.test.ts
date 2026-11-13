jest.mock('newrelic', () => ({ noticeError: jest.fn(), setTransactionName: jest.fn(), shutdown: (_o: unknown, cb: () => void) => cb() }), {
  virtual: true,
});

import { initNewRelic, recordError, setTransactionName, shutdownNewRelic, type NewRelicAgent } from '../src';

const fakeAgent = (): jest.Mocked<NewRelicAgent> => ({
  noticeError: jest.fn(),
  setTransactionName: jest.fn(),
  shutdown: jest.fn((_o, cb) => cb()),
});

describe('initNewRelic', () => {
  afterEach(async () => {
    await shutdownNewRelic();
    jest.restoreAllMocks();
  });

  it('is a no-op unless NEW_RELIC_ENABLED=true', () => {
    const load = jest.fn();
    expect(initNewRelic('svc', { NEW_RELIC_LICENSE_KEY: 'k' }, load)).toEqual({ enabled: false, reason: 'disabled' });
    expect(load).not.toHaveBeenCalled();
  });

  it('reads process.env by default', () => {
    expect(initNewRelic('svc')).toEqual({ enabled: false, reason: 'disabled' });
  });

  it('warns and stays disabled without a license key', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    const load = jest.fn();
    expect(initNewRelic('svc', { NEW_RELIC_ENABLED: 'true' }, load)).toEqual({
      enabled: false,
      reason: 'missing-license-key',
    });
    expect(load).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('applies defaults and loads the agent when enabled with a key', () => {
    const env: NodeJS.ProcessEnv = { NEW_RELIC_ENABLED: 'true', NEW_RELIC_LICENSE_KEY: 'k', NEWRELIC_LOGS_ENABLED: 'true' };
    const agent = fakeAgent();
    expect(initNewRelic('wallet-service', env, () => agent)).toEqual({ enabled: true });
    expect(env).toMatchObject({
      NEW_RELIC_APP_NAME: 'wallet-service',
      NEW_RELIC_LOG_LEVEL: 'info',
      NEW_RELIC_NO_CONFIG_FILE: 'true',
      NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: 'true',
    });
    recordError(new Error('boom'), { a: 1 });
    setTransactionName('x');
    expect(agent.noticeError).toHaveBeenCalledWith(expect.any(Error), { a: 1 });
    expect(agent.setTransactionName).toHaveBeenCalledWith('x');
  });

  it('requires the newrelic package by default', () => {
    const env: NodeJS.ProcessEnv = { NEW_RELIC_ENABLED: 'true', NEW_RELIC_LICENSE_KEY: 'k' };
    expect(initNewRelic('svc', env)).toEqual({ enabled: true });
  });

  it('keeps explicit values and disables log forwarding by default', () => {
    const env: NodeJS.ProcessEnv = {
      NEW_RELIC_ENABLED: 'true',
      NEW_RELIC_LICENSE_KEY: 'k',
      NEW_RELIC_APP_NAME: 'custom',
      NEW_RELIC_LOG_LEVEL: 'debug',
    };
    initNewRelic('svc', env, fakeAgent);
    expect(env).toMatchObject({
      NEW_RELIC_APP_NAME: 'custom',
      NEW_RELIC_LOG_LEVEL: 'debug',
      NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: 'false',
    });
  });

  it('continues without APM when the agent fails to load', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();
    const result = initNewRelic('svc', { NEW_RELIC_ENABLED: 'true', NEW_RELIC_LICENSE_KEY: 'k' }, () => {
      throw new Error('missing module');
    });
    expect(result).toEqual({ enabled: false, reason: 'load-failed' });
    expect(error).toHaveBeenCalled();
    expect(() => recordError(new Error('x'))).not.toThrow();
  });

  it('shutdown flushes the agent, propagates errors, and is a no-op when absent', async () => {
    await expect(shutdownNewRelic()).resolves.toBeUndefined();
    const agent = fakeAgent();
    initNewRelic('svc', { NEW_RELIC_ENABLED: 'true', NEW_RELIC_LICENSE_KEY: 'k' }, () => agent);
    await shutdownNewRelic();
    expect(agent.shutdown).toHaveBeenCalledWith({ collectPendingData: true }, expect.any(Function));

    const failing = fakeAgent();
    failing.shutdown.mockImplementation((_o, cb) => cb(new Error('flush failed')));
    initNewRelic('svc', { NEW_RELIC_ENABLED: 'true', NEW_RELIC_LICENSE_KEY: 'k' }, () => failing);
    await expect(shutdownNewRelic()).rejects.toThrow('flush failed');
  });
});
