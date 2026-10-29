import type { HydratedDocument } from 'mongoose';
import type { AuditLogEntity, NewAuditLogProps } from '../../domain/entities/audit-log.entity';
import type { AuditLogRepositoryPort } from '../../application/ports/audit-log-repository.port';
import { AuditLogModel } from './mongoose/audit-log.model';
import type { AuditLogDocumentShape } from './mongoose/audit-log.schema';

const toEntity = (doc: HydratedDocument<AuditLogDocumentShape>): AuditLogEntity => ({
  id: doc.id as string,
  actorUserId: doc.actorUserId,
  action: doc.action,
  entityType: doc.entityType,
  entityId: doc.entityId,
  metadata: doc.metadata,
  createdAt: doc.createdAt,
});

export class MongooseAuditLogRepository implements AuditLogRepositoryPort {
  async create(props: NewAuditLogProps): Promise<AuditLogEntity> {
    const doc = await AuditLogModel.create({
      actorUserId: props.actorUserId,
      action: props.action,
      entityType: props.entityType,
      entityId: props.entityId,
      metadata: props.metadata ?? {},
    });
    return toEntity(doc);
  }
}
