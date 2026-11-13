import type { EmailMessage, EmailSenderPort, ProviderReceipt } from '../../application/ports/email-sender.port';
import { postRequest, type FetchLike } from '../http/post-request';

export interface SendGridEmailSenderOptions {
  apiKey: string;
  fromAddress: string;
  fromName?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

// Twilio SendGrid v3 Mail Send: POST /v3/mail/send -> 202 with the message id in `x-message-id`.
export class SendGridEmailSender implements EmailSenderPort {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly opts: SendGridEmailSenderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? 'https://api.sendgrid.com';
  }

  async send(message: EmailMessage): Promise<ProviderReceipt> {
    const content: Array<{ type: string; value: string }> = [];
    if (message.text !== undefined) content.push({ type: 'text/plain', value: message.text });
    if (message.html !== undefined) content.push({ type: 'text/html', value: message.html });

    const response = await postRequest({
      upstream: 'sendgrid',
      url: `${this.baseUrl}/v3/mail/send`,
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        // One personalization per recipient so recipients never see each other.
        personalizations: message.to.map((email) => ({ to: [{ email }] })),
        from: { email: this.opts.fromAddress, ...(this.opts.fromName ? { name: this.opts.fromName } : {}) },
        subject: message.subject,
        content,
      }),
      fetchImpl: this.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
    });
    return { providerMessageId: response.headers.get('x-message-id') ?? undefined };
  }
}
