import fastify from 'fastify';
import type { Logger } from 'pino';
import type { YoneConfig } from './config/yone-config';
import { platformServerOptions, registerPlatform } from './api/plugins/platform';
import { notificationRoutes } from './api/routes/notification.routes';
import type { ChatNotifierPort } from './application/ports/chat-notifier.port';
import type { EmailSenderPort } from './application/ports/email-sender.port';
import type { SmsSenderPort } from './application/ports/sms-sender.port';
import { SendEmailUseCase } from './application/use-cases/send-email.use-case';
import { SendSmsUseCase } from './application/use-cases/send-sms.use-case';
import { NotifySlackUseCase } from './application/use-cases/notify-slack.use-case';
import { NotifyTeamsUseCase } from './application/use-cases/notify-teams.use-case';
import { SendGridEmailSender } from './infrastructure/providers/sendgrid-email.sender';
import { TwilioSmsSender } from './infrastructure/providers/twilio-sms.sender';
import { SlackWebhookNotifier } from './infrastructure/providers/slack-webhook.notifier';
import { TeamsWebhookNotifier } from './infrastructure/providers/teams-webhook.notifier';
import {
  unconfiguredChat,
  unconfiguredEmail,
  unconfiguredSms,
} from './infrastructure/providers/unconfigured';

export interface NotificationProviders {
  email: EmailSenderPort;
  sms: SmsSenderPort;
  slack: ChatNotifierPort;
  teams: ChatNotifierPort;
}

// Builds real adapters from config; a channel without credentials gets a 503-ing null adapter.
export const providersFromConfig = (config: YoneConfig): NotificationProviders => {
  const timeoutMs = config.NOTIFICATION_TIMEOUT_MS;
  const hasTargets = (t: Record<string, string>) => Object.keys(t).length > 0;
  return {
    email:
      config.SENDGRID_API_KEY && config.EMAIL_FROM_ADDRESS
        ? new SendGridEmailSender({
            apiKey: config.SENDGRID_API_KEY,
            fromAddress: config.EMAIL_FROM_ADDRESS,
            fromName: config.EMAIL_FROM_NAME,
            timeoutMs,
          })
        : unconfiguredEmail(),
    sms:
      config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN
        ? new TwilioSmsSender({
            accountSid: config.TWILIO_ACCOUNT_SID,
            authToken: config.TWILIO_AUTH_TOKEN,
            from: config.TWILIO_SMS_FROM,
            messagingServiceSid: config.TWILIO_MESSAGING_SERVICE_SID,
            timeoutMs,
          })
        : unconfiguredSms(),
    slack: hasTargets(config.SLACK_WEBHOOK_URLS)
      ? new SlackWebhookNotifier({ targets: config.SLACK_WEBHOOK_URLS, timeoutMs })
      : unconfiguredChat('slack'),
    teams: hasTargets(config.TEAMS_WEBHOOK_URLS)
      ? new TeamsWebhookNotifier({ targets: config.TEAMS_WEBHOOK_URLS, timeoutMs })
      : unconfiguredChat('teams'),
  };
};

export interface BuildAppOptions {
  config: YoneConfig;
  logger: Logger;
  /** Override provider adapters (tests); defaults to providersFromConfig(config). */
  providers?: NotificationProviders;
}

// Composition root: wires provider adapters into use-cases and registers plugins/routes.
export const buildApp = async ({ config, logger, providers = providersFromConfig(config) }: BuildAppOptions) => {
  const app = fastify({ loggerInstance: logger, ...platformServerOptions(config) });
  await registerPlatform(app, config);

  await app.register(notificationRoutes, {
    prefix: '/api/v1/notifications',
    allowedServiceTokens: config.ALLOWED_SERVICE_TOKENS,
    sendEmailUseCase: new SendEmailUseCase(providers.email),
    sendSmsUseCase: new SendSmsUseCase(providers.sms),
    notifySlackUseCase: new NotifySlackUseCase(providers.slack),
    notifyTeamsUseCase: new NotifyTeamsUseCase(providers.teams),
  });
  return app;
};
