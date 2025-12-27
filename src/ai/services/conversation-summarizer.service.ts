import { Injectable } from '@nestjs/common';
import { AiService } from '../ai.service';
import { LoggerService } from '../../observability/logger.service';
import { Conversation } from '../../database/entities/tenant/conversation.entity';

@Injectable()
export class ConversationSummarizerService {
  constructor(
    private readonly ai: AiService,
    private readonly logger: LoggerService,
  ) {}

  async generateSummary(
    conversation: Conversation,
    tenantSlug: string,
    recentMessages: string[],
  ): Promise<string> {
    if (!Array.isArray(recentMessages) || recentMessages.length < 5) {
      this.logger.log(
        JSON.stringify({
          event: 'conversation_too_short_to_summarize',
          conversationId: conversation?.id,
          count: Array.isArray(recentMessages) ? recentMessages.length : 0,
        }),
        'ConversationSummarizerService',
      );
      return (conversation as any)?.metadata?.summary || '';
    }

    try {
      const historyText = recentMessages.join('\n');
      const prompt = `Summarize the following conversation history into 3 concise sentences. Focus on user needs, budget, and key details. History:\n${historyText}`;

      const aiResult = await this.ai.generateResponse({
        tenantSlug,
        userText: prompt,
      });

      if (!aiResult?.ok) return '';

      this.logger.log(
        JSON.stringify({
          event: 'conversation_summary_generated',
          conversationId: conversation?.id,
        }),
        'ConversationSummarizerService',
      );

      return aiResult.text;
    } catch (error: any) {
      this.logger.error(
        JSON.stringify({
          event: 'conversation_summarization_failed',
          conversationId: conversation?.id,
          error: error?.message,
        }),
        '',
        'ConversationSummarizerService',
      );
      return '';
    }
  }
}
