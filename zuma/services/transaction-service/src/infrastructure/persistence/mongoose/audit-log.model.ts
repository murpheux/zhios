import { model, type Model } from 'mongoose';
import { auditLogSchema, type AuditLogDocumentShape } from './audit-log.schema';

export const AuditLogModel: Model<AuditLogDocumentShape> = model<AuditLogDocumentShape>(
  'AuditLog',
  auditLogSchema,
);
