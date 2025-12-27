import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { TenantContextService } from '../database/services/tenant-context.service';
import { Conversation } from '../database/entities/tenant/conversation.entity';

@Injectable()
export class ConversationRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  // >>> GRANDMASTER INJECTION: read conversation for state-machine routing >>>
  async findById(tenantSlug: string, conversationId: string): Promise<Conversation | null> {
    return this.tenantContext.executeInTenantSchema(tenantSlug, async (qr: QueryRunner) => {
      return qr.manager.getRepository(Conversation).findOne({
        where: { id: conversationId },
      });
    });
  }
  // <<< END INJECTION <<<

  async findOrCreate(input: {
    tenantSlug: string;
    platform: string;
    platformThreadId: string;
    userIdentifier: string;
  }): Promise<Conversation> {
    const { tenantSlug, platform, platformThreadId, userIdentifier } = input;

    return this.tenantContext.executeInTenantSchema(tenantSlug, async (qr: QueryRunner) => {
      const repo = qr.manager.getRepository(Conversation);

      const existing = await repo.findOne({ where: { platformThreadId } });
      if (existing) return existing;

      const created = repo.create({
        platform,
        platformThreadId,
        userIdentifier,
        status: 'active',
        lastActivity: new Date(),
        metadata: {},
      } as Conversation);

      return repo.save(created);
    });
  }

  async updateLastActivity(
    tenantSlug: string,
    conversationId: string,
    when: Date,
  ): Promise<void> {
    await this.tenantContext.executeInTenantSchema(tenantSlug, async (qr: QueryRunner) => {
      const repo = qr.manager.getRepository(Conversation);
      await repo.update({ id: conversationId }, { lastActivity: when });
    });
  }

  async mergeMetadataDeep(
    tenantSlug: string,
    conversationId: string,
    patch: Record<string, any>,
  ): Promise<void> {
    await this.tenantContext.executeInTenantSchema(tenantSlug, async (qr: QueryRunner) => {
      const repo = qr.manager.getRepository(Conversation);

      const existing = await repo.findOne({ where: { id: conversationId } });
      if (!existing) return;

      const current = (existing.metadata ?? {}) as Record<string, any>;
      const merged = this.deepMerge(current, patch);

      await repo.update({ id: conversationId }, { metadata: merged });
    });
  }

  // >>> GRANDMASTER INJECTION: deep merge helper (deterministic, no deps) >>>
  private deepMerge(target: any, source: any): any {
    if (!source || typeof source !== 'object') return target;

    const out = Array.isArray(target) ? [...target] : { ...(target ?? {}) };

    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      const tgtVal = out[key];

      if (Array.isArray(srcVal)) {
        out[key] = srcVal; // arrays replace (deterministic)
        continue;
      }

      if (srcVal && typeof srcVal === 'object') {
        out[key] = this.deepMerge(
          tgtVal && typeof tgtVal === 'object' ? tgtVal : {},
          srcVal,
        );
        continue;
      }

      out[key] = srcVal;
    }

    return out;
  }
  // <<< END INJECTION <<<
}
