// src/database/shared/base.entity.ts
import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Column,
} from 'typeorm';

/**
 * BaseEntity
 *
 * This is the canonical base class for ALL database entities
 * (core + tenant schemas).
 *
 * It standardizes:
 * - UUID primary keys
 * - created_at / updated_at timestamps
 * - optimistic locking (version)
 * - soft metadata extension point
 *
 * NEVER put business fields here.
 */
export abstract class BaseEntity {
  /**
   * Primary UUID identifier.
   * Uses uuid-ossp extension (already enabled in DB bootstrap).
   */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Creation timestamp (UTC, DB-managed).
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt!: Date;

  /**
   * Last update timestamp (UTC, DB-managed).
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt!: Date;

  /**
   * Optimistic locking column.
   * Prevents silent overwrites in concurrent writes.
   */
  @VersionColumn()
  version!: number;

  /**
   * Optional metadata extension point.
   * Used for diagnostics, audit references, and future-safe expansion.
   *
   * IMPORTANT:
   * - Do NOT store PII here unless explicitly redacted upstream.
   * - Treat as write-once or append-only in practice.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata?: Record<string, any>;
}
