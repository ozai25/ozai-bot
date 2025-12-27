import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'core', name: 'audit_logs' })
@Index('idx_audit_logs_created_at', ['createdAt'])
@Index('idx_audit_logs_request_id', ['requestId'])
@Index('idx_audit_logs_tenant_slug', ['tenantSlug'])
@Index('idx_audit_logs_actor', ['actorType', 'actorId'])
@Index('idx_audit_logs_route', ['method', 'path'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  /**
   * Correlation ID (RequestContextMiddleware should set X-Request-Id).
   */
  @Column({ type: 'varchar', length: 128, name: 'request_id', nullable: true })
  requestId!: string | null;

  /**
   * Tenant slug when available (e.g. oz01 / sg01 / fp02).
   * Stored in core schema for global auditability.
   */
  @Column({ type: 'varchar', length: 32, name: 'tenant_slug', nullable: true })
  tenantSlug!: string | null;

  /**
   * Actor identity (if known).
   * actorType examples: 'admin_key', 'dev_key', 'platform_user', 'system'
   */
  @Column({ type: 'varchar', length: 32, name: 'actor_type', nullable: true })
  actorType!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'actor_id', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 16, name: 'method', nullable: true })
  method!: string | null;

  @Column({ type: 'varchar', length: 1024, name: 'path', nullable: true })
  path!: string | null;

  @Column({ type: 'int', name: 'status_code', nullable: true })
  statusCode!: number | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'varchar', length: 128, name: 'ip', nullable: true })
  ip!: string | null;

  @Column({ type: 'varchar', length: 512, name: 'user_agent', nullable: true })
  userAgent!: string | null;

  /**
   * Arbitrary structured context. MUST be already redacted at write time.
   */
  @Column({ type: 'jsonb', name: 'metadata', nullable: true })
  metadata!: Record<string, any> | null;

  /**
   * Error summary only (never raw stack with secrets).
   */
  @Column({ type: 'varchar', length: 1024, name: 'error', nullable: true })
  error!: string | null;
}
