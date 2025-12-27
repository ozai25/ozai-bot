import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from './message.entity';

// >>> ADD START: Metadata typing helpers (NO schema change) >>>
export type ConversationPlatform =
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'telegram'
  | string;

export interface ConversationMetadata {
  // high-signal state
  intent?: string;
  leadScore?: {
    score?: number;
    classification?: 'hot' | 'warm' | 'cold' | 'spam' | string;
    signals?: Record<string, any>;
  };

  // quote state
  quote?: {
    lastQuoteAt?: string; // ISO string
    serviceType?: string;
    urgency?: 'standard' | 'same-day' | 'emergency' | string;
    squareFootage?: number;
    price?: number;
    currency?: string;
    missing?: string[];
  };

  // appointment state
  appointment?: {
    offeredSlots?: string[];
    pending?: boolean;
    lastOfferedAt?: string; // ISO string
    selectedSlot?: string;
    missing?: string[];
  };

  // compliance / control flags
  flags?: {
    optedOut?: boolean;
    humanHandoff?: boolean;
    muted?: boolean;
  };

  // freeform extension
  [key: string]: any;
}
// <<< ADD END <<<

// NOTE: schema is NOT set here.
// We rely on Postgres search_path so this maps to:
//   sg01.conversations, fp02.conversations, oz01.conversations, etc.
@Entity({ name: 'conversations' })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  platform: string; // 'facebook', 'instagram', etc.

  @Column({
    type: 'varchar',
    length: 255,
    name: 'platform_thread_id',
    unique: true,
  })
  platformThreadId: string;

  @Column({ type: 'varchar', length: 255, name: 'user_identifier' })
  userIdentifier: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string; // 'active', 'muted', 'admin_override', 'closed'

  @Column({
    type: 'varchar',
    length: 100,
    name: 'assigned_brain',
    nullable: true,
  })
  assignedBrain: string | null; // 'main', 'sales', 'repairs', etc.

  @Column({
    type: 'timestamptz',
    name: 'last_admin_interaction',
    nullable: true,
  })
  lastAdminInteraction: Date | null;

  @Column({
    type: 'timestamptz',
    name: 'last_activity',
    default: () => 'NOW()',
  })
  lastActivity: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // >>> ADD START: Safe metadata helpers (NO DB change) >>>
  getMetadata(): ConversationMetadata {
    if (!this.metadata || typeof this.metadata !== 'object') {
      this.metadata = {};
    }
    return this.metadata as ConversationMetadata;
  }

  mergeMetadata(partial: Partial<ConversationMetadata>): ConversationMetadata {
    const current = this.getMetadata();
    this.metadata = { ...current, ...partial } as any;
    return this.metadata as ConversationMetadata;
  }

  mergeMetadataDeep(partial: Partial<ConversationMetadata>): ConversationMetadata {
    const current = this.getMetadata();
    const next: ConversationMetadata = { ...current };

    if (partial.intent !== undefined) next.intent = partial.intent;

    if (partial.leadScore) {
      next.leadScore = { ...(current.leadScore ?? {}), ...(partial.leadScore ?? {}) };
    }

    if (partial.quote) {
      next.quote = { ...(current.quote ?? {}), ...(partial.quote ?? {}) };
    }

    if (partial.appointment) {
      next.appointment = { ...(current.appointment ?? {}), ...(partial.appointment ?? {}) };
    }

    if (partial.flags) {
      next.flags = { ...(current.flags ?? {}), ...(partial.flags ?? {}) };
    }

    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined) continue;
      if (
        k === 'intent' ||
        k === 'leadScore' ||
        k === 'quote' ||
        k === 'appointment' ||
        k === 'flags'
      )
        continue;
      (next as any)[k] = v;
    }

    this.metadata = next as any;
    return next;
  }

  setIntent(intent: string): void {
    const meta = this.getMetadata();
    meta.intent = intent;
    this.metadata = meta as any;
  }

  setLeadScore(score: ConversationMetadata['leadScore']): void {
    const meta = this.getMetadata();
    meta.leadScore = { ...(meta.leadScore ?? {}), ...(score ?? {}) };
    this.metadata = meta as any;
  }

  markOptedOut(): void {
    const meta = this.getMetadata();
    meta.flags = { ...(meta.flags ?? {}), optedOut: true };
    this.metadata = meta as any;
    this.status = this.status || 'active';
  }

  markHumanHandoff(): void {
    const meta = this.getMetadata();
    meta.flags = { ...(meta.flags ?? {}), humanHandoff: true };
    this.metadata = meta as any;
  }

  setQuoteState(partial: Partial<ConversationMetadata['quote']>): void {
    const meta = this.getMetadata();
    meta.quote = { ...(meta.quote ?? {}), ...(partial ?? {}) };
    this.metadata = meta as any;
  }

  setAppointmentState(partial: Partial<ConversationMetadata['appointment']>): void {
    const meta = this.getMetadata();
    meta.appointment = { ...(meta.appointment ?? {}), ...(partial ?? {}) };
    this.metadata = meta as any;
  }
  // <<< ADD END <<<
}
