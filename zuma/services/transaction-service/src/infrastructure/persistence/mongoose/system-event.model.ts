import { model, type Model } from 'mongoose';
import { systemEventSchema, type SystemEventDocumentShape } from './system-event.schema';

export const SystemEventModel: Model<SystemEventDocumentShape> = model<SystemEventDocumentShape>(
  'SystemEvent',
  systemEventSchema,
);
