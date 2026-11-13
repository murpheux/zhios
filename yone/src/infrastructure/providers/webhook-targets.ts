import { ValidationError } from '../../domain/errors';

export type WebhookTargets = Readonly<Record<string, string>>;

// Callers choose a named target; the URL (a bearer secret) never leaves configuration.
export const resolveWebhook = (targets: WebhookTargets, target: string, platform: string): string => {
  const url = Object.hasOwn(targets, target) ? targets[target] : undefined;
  if (!url) throw new ValidationError(`Unknown ${platform} target '${target}'`);
  return url;
};
