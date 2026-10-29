import type { NewAuditLogProps, AuditLogEntity } from '../../domain/entities/audit-log.entity';

// Repository port for audit log persistence.
export interface AuditLogRepositoryPort {
  create(props: NewAuditLogProps): Promise<AuditLogEntity>;
}
