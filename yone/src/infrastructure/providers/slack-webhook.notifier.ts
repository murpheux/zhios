import type { ChatMessage, ChatNotifierPort } from '../../application/ports/chat-notifier.port';
import { postRequest, type FetchLike } from '../http/post-request';
import { resolveWebhook, type WebhookTargets } from './webhook-targets';

export interface SlackWebhookNotifierOptions {
  targets: WebhookTargets;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

// Slack incoming webhook: POST {text}; Slack replies 200 "ok". The channel is fixed by the webhook.
export class SlackWebhookNotifier implements ChatNotifierPort {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: SlackWebhookNotifierOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async post(message: ChatMessage): Promise<void> {
    await postRequest({
      upstream: 'slack',
      url: resolveWebhook(this.opts.targets, message.target, 'slack'),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message.text }),
      fetchImpl: this.fetchImpl,
      timeoutMs: this.opts.timeoutMs,
    });
  }
}
