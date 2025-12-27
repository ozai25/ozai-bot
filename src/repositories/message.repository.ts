// src/repositories/message.repository.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TenantContextService } from '../database/services/tenant-context.service';
import { Message } from '../database/entities/tenant/message.entity';

@Injectable()
export class MessageRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getSchemaOrThrow(): string {
    const schema =
      (this.tenantContext as any)?.getSchema?.() ??
      (this.tenantContext as any)?.schema ??
      (this.tenantContext as any)?.getTenantSchema?.();

    const s = String(schema ?? '').trim();
    if (!s) {
      throw new Error('Tenant schema is not resolved (TenantContextService).');
    }
    return s;
  }

  private async withTenant<T>(fn: (qr: any) => Promise<T>): Promise<T> {
    const schema = this.getSchemaOrThrow();
    const qr = this.dataSource.createQueryRunner();

    await qr.connect();
    try {
      // Critical multi-tenant safety invariant:
      // every tenant-scoped query must pin the schema.
      await qr.query(`SET search_path TO "${schema}", public`);
      const result = await fn(qr);
      return result;
    } finally {
      await qr.release();
    }
  }

  async create(input: Partial<Message>): Promise<Message> {
    return this.withTenant(async (qr) => {
      const repo = qr.manager.getRepository(Message);
      const entity = repo.create(input);
      return repo.save(entity);
    });
  }

  async findById(id: string): Promise<Message | null> {
    return this.withTenant(async (qr) => {
      const repo = qr.manager.getRepository(Message);
      return repo.findOne({ where: { id } as any });
    });
  }

  async listByConversationId(
    conversationId: string,
    take = 50,
  ): Promise<Message[]> {
    const safeTake = Math.max(1, Math.min(Number(take) || 50, 200));

    return this.withTenant(async (qr) => {
      const repo = qr.manager.getRepository(Message);
      return repo.find({
        where: { conversationId } as any,
        order: { createdAt: 'DESC' } as any,
        take: safeTake,
      });
    });
  }
}
