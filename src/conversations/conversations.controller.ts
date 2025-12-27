import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ConversationsService } from './conversations.service';

import { AdminGuard } from '../guards/admin.guard';
import { DevOnlyGuard } from '../guards/dev-only.guard';

import { TenantSlugParamDto } from '../dto/tenant-slug-param.dto';
import { LogMessageDto } from '../dto/log-message.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
  ) {}

  /**
   * DEV-ONLY: write a message into tenant DB for test/instrumentation.
   *
   * POST /conversations/:tenantSlug/test/log
   */
  @UseGuards(DevOnlyGuard)
  @Post(':tenantSlug/test/log')
  async logTestMessage(
    @Param() params: TenantSlugParamDto,
    @Body() body: LogMessageDto,
  ) {
    const tenantSlug = String(params.tenantSlug || '').trim().toLowerCase();

    return this.conversations.logTestMessage(
      tenantSlug,
      String(body.userIdentifier ?? ''),
      String(body.content ?? ''),
      String((body as any).platform ?? 'debug'),
      (body as any).platformThreadId ? String((body as any).platformThreadId) : undefined,
      (body as any).metadata ? (body as any).metadata : undefined,
    );
  }

  /**
   * ✅ ADD: alias route so your curl works as-is
   *
   * POST /conversations/:tenantSlug/log
   */
  @UseGuards(DevOnlyGuard)
  @Post(':tenantSlug/log')
  async logTestMessageAlias(
    @Param() params: TenantSlugParamDto,
    @Body() body: LogMessageDto,
  ) {
    const tenantSlug = String(params.tenantSlug || '').trim().toLowerCase();

    return this.conversations.logTestMessage(
      tenantSlug,
      String(body.userIdentifier ?? ''),
      String(body.content ?? ''),
      String((body as any).platform ?? 'debug'),
      (body as any).platformThreadId ? String((body as any).platformThreadId) : undefined,
      (body as any).metadata ? (body as any).metadata : undefined,
    );
  }

  /**
   * ADMIN: retrieve a conversation + messages for a given userIdentifier
   *
   * GET /conversations/:tenantSlug/:userIdentifier
   */
  @UseGuards(AdminGuard)
  @Get(':tenantSlug/:userIdentifier')
  async getConversationWithMessages(
    @Param('tenantSlug') tenantSlug: string,
    @Param('userIdentifier') userIdentifier: string,
  ) {
    return this.conversations.getConversationWithMessages(
      String(tenantSlug || '').trim().toLowerCase(),
      String(userIdentifier || '').trim(),
    );
  }
}
