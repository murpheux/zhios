import type { NotificationResultDto, SendSmsRequestDto } from '../../shared/notification.dto';
import { MAX_SMS_LENGTH, assertE164, assertText } from '../../domain/notification';
import type { SmsSenderPort } from '../ports/sms-sender.port';

export class SendSmsUseCase {
  constructor(private readonly sender: SmsSenderPort) {}

  async execute(request: SendSmsRequestDto): Promise<NotificationResultDto> {
    const receipt = await this.sender.send({
      to: assertE164(request.to),
      body: assertText(request.body, 'body', MAX_SMS_LENGTH),
    });
    return { channel: 'sms', status: 'accepted', providerMessageId: receipt.providerMessageId };
  }
}
