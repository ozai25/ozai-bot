import { Injectable } from '@nestjs/common';
import { AiDecisionAdapter, AiDecisionAdapterInput } from './ai-decision-adapter';
import { AiDecisionOutput } from '../contracts/ai-decision-output';

// Default adapter = NO-OP (rules still work). Later we swap this to your real AI service.
@Injectable()
export class DefaultAiDecisionAdapterService implements AiDecisionAdapter {
  async decide(_input: AiDecisionAdapterInput): Promise<AiDecisionOutput | null> {
    return null;
  }
}
