import type { ChatMessage, ChatNotifierPort } from '../../application/ports/chat-notifier.port';
import { postRequest, type FetchLike } from '../http/post-request';
import { resolveWebhook, type WebhookTargets } from './webhook-targets';

export interface TeamsWebhookNotifierOptions {
  targets: WebhookTargets;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

// Teams "Workflows" webhook (the replacement for retired Office 365 connectors) expects a message
// carrying an Adaptive Card attachment.
export class TeamsWebhookNotifier implements ChatNotifierPort {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: TeamsWebhookNotifierOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async post(message: ChatMessage): Promise<void> {
    const body: Array<Record<string, unknown>> = [];
    if (message.title) body.push({ type: 'TextBlock', text: message.title, weight: 'Bolder', size: 'Medium', wrap: true });
    body.push({ type: 'TextBlock', text: message.text, wrap: true });

    await postRequest({
      upstream: 'teams',
      url: resolveWebhook(this.opts.targets, message.target, 'teams'),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body,
            },
          },
        ],
      }),
      fetchImpl: this.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
    });
  }
}
