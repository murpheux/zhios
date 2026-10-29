// Immutable record of a sensitive or state-changing action, for compliance/audit trails.
export interface AuditLogEntity {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface NewAuditLogProps {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export const createAuditLogEntity = (
  props: NewAuditLogProps,
): Omit<AuditLogEntity, 'id' | 'createdAt'> => ({
  actorUserId: props.actorUserId,
  action: props.action,
  entityType: props.entityType,
  entityId: props.entityId,
  metadata: props.metadata ?? {},
});
