import type { NewSystemEventProps } from '../../domain/entities/system-event.entity';
import { createSystemEventEntity } from '../../domain/entities/system-event.entity';
import type { SystemEventRepositoryPort } from '../../application/ports/system-event-repository.port';
import { SystemEventModel } from './mongoose/system-event.model';

export class MongooseSystemEventRepository implements SystemEventRepositoryPort {
  async record(props: NewSystemEventProps): Promise<void> {
    await SystemEventModel.create(createSystemEventEntity(props));
  }
}
