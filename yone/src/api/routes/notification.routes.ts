import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { serviceTokenMiddleware } from '../../infrastructure/middleware/service-token.middleware';
import type {
  ChatNotificationRequestDto,
  SendEmailRequestDto,
  SendSmsRequestDto,
} from '../../shared/notification.dto';
import type { SendEmailUseCase } from '../../application/use-cases/send-email.use-case';
import type { SendSmsUseCase } from '../../application/use-cases/send-sms.use-case';
import type { NotifySlackUseCase } from '../../application/use-cases/notify-slack.use-case';
import type { NotifyTeamsUseCase } from '../../application/use-cases/notify-teams.use-case';
import {
  notifySlackSchema,
  notifyTeamsSchema,
  sendEmailSchema,
  sendSmsSchema,
} from '../schemas/notification.schemas';

export interface NotificationRoutesOptions {
  allowedServiceTokens: string[];
  sendEmailUseCase: SendEmailUseCase;
  sendSmsUseCase: SendSmsUseCase;
  notifySlackUseCase: NotifySlackUseCase;
  notifyTeamsUseCase: NotifyTeamsUseCase;
}

// Service-to-service only (x-service-token from the configured allow-list); there is no end-user access.
export const notificationRoutes: FastifyPluginAsync<NotificationRoutesOptions> = async (
  app: FastifyInstance,
  opts: NotificationRoutesOptions,
) => {
  const onRequest = [serviceTokenMiddleware(opts.allowedServiceTokens)];

  app.post<{ Body: SendEmailRequestDto }>('/email', { schema: sendEmailSchema, onRequest }, async (req, reply) =>
    reply.status(202).send(await opts.sendEmailUseCase.execute(req.body)),
  );
  app.post<{ Body: SendSmsRequestDto }>('/sms', { schema: sendSmsSchema, onRequest }, async (req, reply) =>
    reply.status(202).send(await opts.sendSmsUseCase.execute(req.body)),
  );
  app.post<{ Body: ChatNotificationRequestDto }>('/slack', { schema: notifySlackSchema, onRequest }, async (req, reply) =>
    reply.status(202).send(await opts.notifySlackUseCase.execute(req.body)),
  );
  app.post<{ Body: ChatNotificationRequestDto }>('/teams', { schema: notifyTeamsSchema, onRequest }, async (req, reply) =>
    reply.status(202).send(await opts.notifyTeamsUseCase.execute(req.body)),
  );
};
