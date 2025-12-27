import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

import { Conversation } from '../database/entities/tenant/conversation.entity';
import { Message } from '../database/entities/tenant/message.entity';

import { TenantsService } from '../modules/core/tenants/tenants.service';

// ✅ ADD: use your structured logger (AsyncLocalStorage context)
import { LoggerService } from '../observability/logger.service';

// ✅ ADD: PII redaction before DB + logs
import { PiiRedactorService } from '../security/pii-redactor.service';

@Injectable()
export class ConversationsService {
  // ✅ REPLACE: use LoggerService, not Nest Logger
  private readonly ALLOWED_SCHEMAS = ['sg01', 'fp02', 'oz01']; // ✅ SQL injection prevention

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,

    // ✅ ADD
    private readonly logger: LoggerService,

    // ✅ ADD
    private readonly pii: PiiRedactorService,
  ) {}

  /**
   * ✅ PRODUCTION-READY: Execute operation in tenant-specific schema
   * with proper resource management and error handling
   */
  private async executeInTenantSchema<T>(
    tenantSlug: string,
    operation: (
      queryRunner: QueryRunner,
      tenant: { slug: string; schemaName: string },
    ) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Resolve tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new NotFoundException(`Tenant ${tenantSlug} not found`);
      }

      // ✅ CRITICAL: Validate schema against whitelist (prevents SQL injection)
      if (!this.ALLOWED_SCHEMAS.includes(tenant.schemaName)) {
        this.logger.error(
          JSON.stringify({
            event: 'tenant_invalid_schema',
            tenantSlug,
            schemaName: tenant.schemaName,
          }),
          '',
          'ConversationsService',
        );
        throw new InternalServerErrorException('Invalid tenant configuration');
      }

      // ✅ Set schema context (safe after whitelist validation)
      await queryRunner.query(`SET search_path TO ${tenant.schemaName}, core`);

      // ✅ Safe log (no user content)
      this.logger.log(
        JSON.stringify({
          event: 'tenant_schema_context_set',
          tenantSlug,
          schemaName: tenant.schemaName,
        }),
        'ConversationsService',
      );

      // Execute operation
      const result = await operation(queryRunner, {
        slug: tenant.slug,
        schemaName: tenant.schemaName,
      });

      await queryRunner.commitTransaction();
      return result;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();

      // ✅ Safe log: never dump raw payloads
      this.logger.error(
        JSON.stringify({
          event: 'tenant_tx_failed',
          tenantSlug,
          error: String(error?.message ?? error),
          code: error?.code,
        }),
        error?.stack,
        'ConversationsService',
      );

      // ✅ Map database errors to safe responses
      if (error instanceof NotFoundException) throw error;
      if (error instanceof HttpException) throw error;

      // Database-specific errors
      if (error?.code === '23505') {
        // Unique constraint violation
        throw new HttpException('Resource already exists', HttpStatus.CONFLICT);
      }

      if (error?.code === '23503') {
        // Foreign key violation
        throw new HttpException('Invalid reference', HttpStatus.BAD_REQUEST);
      }

      // Generic safe error
      throw new InternalServerErrorException('Failed to process request');
    } finally {
      // ✅ CRITICAL: Always release connection
      await queryRunner.release();
    }
  }

  /**
   * ✅ PRODUCTION-READY: Log a test message with proper error handling
   */
  async logTestMessage(
    tenantSlug: string,
    userIdentifier: string,
    content: string,
    platform: string = 'debug',
    platformThreadId?: string,
    metadata?: Record<string, any>,
  ): Promise<any> {
    // ✅ Redact BEFORE any logs
    const safeUserIdForLogs = this.pii.redact(String(userIdentifier ?? ''));
    const safeContentForLogs = this.pii.redact(String(content ?? ''));

    this.logger.log(
      JSON.stringify({
        event: 'conversation_log_test_message',
        tenantSlug,
        userIdentifier: safeUserIdForLogs,
        contentPreview: safeContentForLogs.slice(0, 120),
        platform,
      }),
      'ConversationsService',
    );

    return this.executeInTenantSchema(tenantSlug, async (qr, tenant) => {
      const convRepo = qr.manager.getRepository(Conversation);
      const msgRepo = qr.manager.getRepository(Message);

      const threadId = platformThreadId || userIdentifier;

      // ✅ Scrub metadata BEFORE DB write
      const safeMetadataForDb = this.redactObject(
        metadata || { source: 'debug-endpoint' },
      );

      // ✅ UPSERT pattern: Handles race conditions
      let conversation = await convRepo.findOne({
        where: { platformThreadId: threadId },
      });

      if (!conversation) {
        conversation = convRepo.create({
          platform,
          platformThreadId: threadId,
          userIdentifier,
          status: 'active',
          metadata: safeMetadataForDb,
          lastActivity: new Date(),
        });

        await convRepo.save(conversation);

        this.logger.log(
          JSON.stringify({
            event: 'conversation_created',
            tenantSlug: tenant.slug,
            schema: tenant.schemaName,
            conversationId: conversation.id,
          }),
          'ConversationsService',
        );
      } else {
        // Update last activity
        conversation.lastActivity = new Date();

        if (metadata) {
          // ✅ Scrub merged metadata BEFORE DB write
          conversation.metadata = this.redactObject({
            ...(conversation.metadata || {}),
            ...(metadata || {}),
          });
        }

        await convRepo.save(conversation);

        this.logger.log(
          JSON.stringify({
            event: 'conversation_updated',
            tenantSlug: tenant.slug,
            schema: tenant.schemaName,
            conversationId: conversation.id,
          }),
          'ConversationsService',
        );
      }

      // ✅ Redact content BEFORE DB write
      const safeContentForDb = this.pii.redact(String(content ?? ''));

      // Insert message
      const message = msgRepo.create({
        conversationId: conversation.id,
        role: 'user',
        content: safeContentForDb,
        intentClassification: null,
        metadata: this.redactObject({ debug: true, ...(metadata || {}) }),
      });

      await msgRepo.save(message);

      this.logger.log(
        JSON.stringify({
          event: 'message_created',
          tenantSlug: tenant.slug,
          schema: tenant.schemaName,
          conversationId: conversation.id,
          messageId: message.id,
        }),
        'ConversationsService',
      );

      return {
        status: 'ok',
        tenant: tenant.slug,
        schema: tenant.schemaName,
        conversationId: conversation.id,
        messageId: message.id,
        timestamp: new Date().toISOString(),
      };
    });
  }

  /**
   * ✅ PRODUCTION-READY: Get conversation with messages
   * Includes tenant isolation verification
   */
  async getConversationWithMessages(
    tenantSlug: string,
    userIdentifier: string,
  ): Promise<any> {
    // ✅ Safe logs
    const safeUserIdForLogs = this.pii.redact(String(userIdentifier ?? ''));

    this.logger.log(
      JSON.stringify({
        event: 'conversation_get_with_messages',
        tenantSlug,
        userIdentifier: safeUserIdForLogs,
      }),
      'ConversationsService',
    );

    return this.executeInTenantSchema(tenantSlug, async (qr, tenant) => {
      const convRepo = qr.manager.getRepository(Conversation);
      const msgRepo = qr.manager.getRepository(Message);

      // ✅ CRITICAL: Verify conversation exists in THIS tenant's schema
      const conversation = await convRepo.findOne({
        where: { platformThreadId: userIdentifier },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation for user ${safeUserIdForLogs} not found in tenant ${tenantSlug}`,
        );
      }

      const messages = await msgRepo.find({
        where: { conversationId: conversation.id },
        order: { timestamp: 'ASC' },
      });

      this.logger.log(
        JSON.stringify({
          event: 'conversation_messages_loaded',
          tenantSlug: tenant.slug,
          schema: tenant.schemaName,
          conversationId: conversation.id,
          messageCount: messages.length,
        }),
        'ConversationsService',
      );

      // ✅ Redact outbound payloads (debug endpoints are high-risk)
      return {
        tenant: tenant.slug,
        schema: tenant.schemaName,
        conversation: {
          id: conversation.id,
          platform: conversation.platform,
          platformThreadId: conversation.platformThreadId,
          userIdentifier: conversation.userIdentifier, // keep value (ops), but do not log it raw
          status: conversation.status,
          assignedBrain: conversation.assignedBrain,
          lastActivity: conversation.lastActivity,
          createdAt: conversation.createdAt,
          metadata: this.redactObject(conversation.metadata || {}),
        },
        messages: messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: this.pii.redact(String(msg.content ?? '')),
          timestamp: msg.timestamp,
          intentClassification: msg.intentClassification,
          metadata: this.redactObject(msg.metadata || {}),
        })),
        messageCount: messages.length,
      };
    });
  }

  // ======================
  // ✅ Redaction helpers
  // ======================

  private redactObject<T = any>(input: T): T {
    if (input == null) return input as T;

    if (typeof input === 'string') {
      return this.pii.redact(input) as any as T;
    }

    if (Array.isArray(input)) {
      return input.map((v) => this.redactObject(v)) as any as T;
    }

    if (typeof input === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(input as any)) {
        out[k] = this.redactObject(v);
      }
      return out as any as T;
    }

    return input as T;
  }
}
