// Internal domain/system event, e.g. for eventual outbox/event-bus publication.
export interface SystemEventEntity {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface NewSystemEventProps {
  eventType: string;
  payload: Record<string, unknown>;
}

export const createSystemEventEntity = (
  props: NewSystemEventProps,
): Omit<SystemEventEntity, 'id' | 'createdAt'> => ({
  eventType: props.eventType,
  payload: props.payload,
});
