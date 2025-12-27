import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiService } from './ai.service';
import { OpenAiProvider } from './providers/openai.provider';
import { ClaudeProvider } from './providers/claude.provider';
import { CircuitBreakerStrategy } from './strategies/circuit-breaker.strategy';

// >>> ADD START: Week 1 intelligence services (aligned paths) >>>
import { IntentClassifierService } from './services/intent-classifier.service';
import { ConversationSummarizerService } from './services/conversation-summarizer.service';
import { LeadScorerService } from './services/lead-scorer.service';
// <<< ADD END <<<

@Module({
  imports: [ConfigModule],
  providers: [
    AiService,
    OpenAiProvider,
    ClaudeProvider,
    CircuitBreakerStrategy,

    // >>> ADD START: Week 1 intelligence services >>>
    IntentClassifierService,
    ConversationSummarizerService,
    LeadScorerService,
    // <<< ADD END <<<
  ],
  exports: [
    AiService,               // ✅ THIS is what TestController needs
    CircuitBreakerStrategy,  // ✅ you already inject this too

    // >>> ADD START: export intelligence services for other modules >>>
    IntentClassifierService,
    ConversationSummarizerService,
    LeadScorerService,
    // <<< ADD END <<<
  ],
})
export class AiModule {}
