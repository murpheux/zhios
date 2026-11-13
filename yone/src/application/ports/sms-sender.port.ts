import type { ProviderReceipt } from './email-sender.port';

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSenderPort {
  send(message: SmsMessage): Promise<ProviderReceipt>;
}
