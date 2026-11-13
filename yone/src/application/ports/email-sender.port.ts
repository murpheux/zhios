export interface EmailMessage {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface ProviderReceipt {
  providerMessageId?: string;
}

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<ProviderReceipt>;
}
