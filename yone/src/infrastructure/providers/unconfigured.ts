import type { ChatNotifierPort } from '../../application/ports/chat-notifier.port';
import type { EmailSenderPort } from '../../application/ports/email-sender.port';
import type { SmsSenderPort } from '../../application/ports/sms-sender.port';
import { ChannelNotConfiguredError } from '../../domain/notification';

// Null-object adapters: a channel with no credentials answers 503 instead of the service failing to start.
export const unconfiguredEmail = (): EmailSenderPort => ({
  send: async () => {
    throw new ChannelNotConfiguredError('email');
  },
});
export const unconfiguredSms = (): SmsSenderPort => ({
  send: async () => {
    throw new ChannelNotConfiguredError('sms');
  },
});
export const unconfiguredChat = (channel: 'slack' | 'teams'): ChatNotifierPort => ({
  post: async () => {
    throw new ChannelNotConfiguredError(channel);
  },
});
