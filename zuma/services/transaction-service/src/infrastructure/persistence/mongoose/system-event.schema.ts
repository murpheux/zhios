import { Schema } from 'mongoose';

export interface SystemEventDocumentShape {
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export const systemEventSchema = new Schema<SystemEventDocumentShape>(
  {
    eventType: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
