// Wire contracts for the notification gateway (yone).

export type NotificationChannel = 'email' | 'sms' | 'slack' | 'teams';

export interface SendEmailRequestDto {
  to: string[];
  subject: string;
  /** At least one of text/html is required. */
  text?: string;
  html?: string;
}

export interface SendSmsRequestDto {
  /** E.164, e.g. +14035550123 */
  to: string;
  body: string;
}

export interface ChatNotificationRequestDto {
  /** Named webhook target configured on the service; defaults to "default". Never a raw URL. */
  target?: string;
  text: string;
  /** Teams only: card title. */
  title?: string;
}

export interface NotificationResultDto {
  channel: NotificationChannel;
  status: 'accepted';
  /** Provider message id when the provider returns one. */
  providerMessageId?: string;
}
