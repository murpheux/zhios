import type { ChatNotificationRequestDto, NotificationResultDto } from '../../shared/notification.dto';
import { MAX_CHAT_TEXT_LENGTH, MAX_SUBJECT_LENGTH, assertTarget, assertText } from '../../domain/notification';
import type { ChatNotifierPort } from '../ports/chat-notifier.port';

export class NotifyTeamsUseCase {
  constructor(private readonly notifier: ChatNotifierPort) {}

  async execute(request: ChatNotificationRequestDto): Promise<NotificationResultDto> {
    await this.notifier.post({
      target: assertTarget(request.target),
      text: assertText(request.text, 'text', MAX_CHAT_TEXT_LENGTH),
      title: request.title === undefined ? undefined : assertText(request.title, 'title', MAX_SUBJECT_LENGTH),
    });
    return { channel: 'teams', status: 'accepted' };
  }
}
