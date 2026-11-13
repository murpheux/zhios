import { ValidationError } from '../../domain/errors';
import type { NotificationResultDto, SendEmailRequestDto } from '../../shared/notification.dto';
import {
  MAX_EMAIL_BODY_LENGTH,
  MAX_RECIPIENTS,
  MAX_SUBJECT_LENGTH,
  assertEmailAddress,
  assertText,
} from '../../domain/notification';
import type { EmailSenderPort } from '../ports/email-sender.port';

export class SendEmailUseCase {
  constructor(private readonly sender: EmailSenderPort) {}

  async execute(request: SendEmailRequestDto): Promise<NotificationResultDto> {
    if (request.to.length === 0 || request.to.length > MAX_RECIPIENTS) {
      throw new ValidationError(`to must contain 1-${MAX_RECIPIENTS} recipients`);
    }
    if (request.text === undefined && request.html === undefined) {
      throw new ValidationError('Either text or html is required');
    }
    const receipt = await this.sender.send({
      to: [...new Set(request.to.map(assertEmailAddress))],
      subject: assertText(request.subject, 'subject', MAX_SUBJECT_LENGTH).replace(/[\r\n]+/g, ' '),
      text: request.text === undefined ? undefined : assertText(request.text, 'text', MAX_EMAIL_BODY_LENGTH),
      html: request.html === undefined ? undefined : assertText(request.html, 'html', MAX_EMAIL_BODY_LENGTH),
    });
    return { channel: 'email', status: 'accepted', providerMessageId: receipt.providerMessageId };
  }
}
