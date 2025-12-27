import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiTestController {
  constructor(private readonly ai: AiService) {}

  @Post('test')
  async test(@Body() body: { tenantSlug: string; userText: string }) {
    const tenantSlug = body?.tenantSlug ?? process.env.DEFAULT_TENANT_SLUG ?? 'oz01';

    const userText = body?.userText ?? 'hello test';

    return await this.ai.generateResponse({ tenantSlug, userText });
  }
}
