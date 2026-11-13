import type { ChatNotificationRequestDto, NotificationResultDto } from '../../shared/notification.dto';
import { MAX_CHAT_TEXT_LENGTH, assertTarget, assertText } from '../../domain/notification';
import type { ChatNotifierPort } from '../ports/chat-notifier.port';

export class NotifySlackUseCase {
  constructor(private readonly notifier: ChatNotifierPort) {}

  async execute(request: ChatNotificationRequestDto): Promise<NotificationResultDto> {
    await this.notifier.post({
      target: assertTarget(request.target),
      text: assertText(request.text, 'text', MAX_CHAT_TEXT_LENGTH),
    });
    return { channel: 'slack', status: 'accepted' };
  }
}
