import type { NewSystemEventProps } from '../../domain/entities/system-event.entity';

// Append-only system/domain events (outbox candidates, reconciliation signals).
export interface SystemEventRepositoryPort {
  record(props: NewSystemEventProps): Promise<void>;
}
