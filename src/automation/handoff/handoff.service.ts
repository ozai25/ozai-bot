// src/automation/handoff/handoff.service.ts
import { Injectable } from '@nestjs/common';
import { ConversationRepository } from '../../repositories/conversation.repository';

@Injectable()
export class HandoffService {
  // default 4 hours if not configured elsewhere
  private readonly defaultTtlMs = 4 * 60 * 60 * 1000;

  constructor(private readonly conversations: ConversationRepository) {}

  async pauseBot(params: {
    tenantSlug: string;
    conversationId: string;
    ttlMs?: number;
    reason?: string;
  }): Promise<void> {
    const { tenantSlug, conversationId, ttlMs, reason } = params;

    await this.conversations.mergeMetadataDeep(tenantSlug, conversationId, {
      flags: {
        humanHandoff: true,
      },
      handoff: {
        pausedAt: new Date().toISOString(),
        ttlMs: typeof ttlMs === 'number' ? ttlMs : this.defaultTtlMs,
        reason: reason ?? 'manual_handoff',
      },
    });
  }

  async resumeBot(params: { tenantSlug: string; conversationId: string }): Promise<void> {
    const { tenantSlug, conversationId } = params;

    await this.conversations.mergeMetadataDeep(tenantSlug, conversationId, {
      flags: {
        humanHandoff: false,
      },
      handoff: {
        resumedAt: new Date().toISOString(),
      },
    });
  }

  async shouldBotReply(params: { tenantSlug: string; conversationId: string }): Promise<boolean> {
    const { tenantSlug, conversationId } = params;

    const conv = await this.conversations.findById(tenantSlug, conversationId);
    if (!conv) return true;

    const meta = (conv.metadata ?? {}) as any;
    const flags = meta.flags ?? {};
    if (!flags.humanHandoff) return true;

    const handoff = meta.handoff ?? {};
    const pausedAt = handoff.pausedAt ? Date.parse(handoff.pausedAt) : 0;
    const ttlMs = typeof handoff.ttlMs === 'number' ? handoff.ttlMs : this.defaultTtlMs;

    // If metadata is malformed, fail-open (reply) OR fail-closed (mute)?
    // For safety, we choose FAIL-CLOSED when humanHandoff=true (prevents bot fighting human).
    if (!pausedAt) return false;

    const expired = Date.now() - pausedAt > ttlMs;
    return expired;
  }
}
