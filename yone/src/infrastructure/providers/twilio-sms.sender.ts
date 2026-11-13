import type { ProviderReceipt } from '../../application/ports/email-sender.port';
import type { SmsMessage, SmsSenderPort } from '../../application/ports/sms-sender.port';
import { postRequest, type FetchLike } from '../http/post-request';

export interface TwilioSmsSenderOptions {
  accountSid: string;
  authToken: string;
  /** Exactly one of from / messagingServiceSid. */
  from?: string;
  messagingServiceSid?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}

// Twilio Programmable Messaging: POST /2010-04-01/Accounts/{sid}/Messages.json (form-encoded, basic auth).
export class TwilioSmsSender implements SmsSenderPort {
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly opts: TwilioSmsSenderOptions) {
    if (!opts.from && !opts.messagingServiceSid) {
      throw new Error('TwilioSmsSender requires from or messagingServiceSid');
    }
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? 'https://api.twilio.com';
  }

  async send(message: SmsMessage): Promise<ProviderReceipt> {
    const form = new URLSearchParams({ To: message.to, Body: message.body });
    if (this.opts.messagingServiceSid) form.set('MessagingServiceSid', this.opts.messagingServiceSid);
    else form.set('From', this.opts.from as string);

    const credentials = Buffer.from(`${this.opts.accountSid}:${this.opts.authToken}`).toString('base64');
    const response = await postRequest({
      upstream: 'twilio',
      url: `${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.opts.accountSid)}/Messages.json`,
      headers: { authorization: `Basic ${credentials}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      fetchImpl: this.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
    });
    const json = (await response.json().catch(() => ({}))) as { sid?: unknown };
    return { providerMessageId: typeof json.sid === 'string' ? json.sid : undefined };
  }
}
