import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../observability/logger.service';

export interface LeadScore {
  score: number; // 0-100
  signals: {
    mentionedBudget: boolean;
    mentionedTimeline: boolean;
    askedDetailedQuestions: boolean;
    urgencyKeywords: string[];
  };
  classification: 'hot' | 'warm' | 'cold' | 'spam';
}

@Injectable()
export class LeadScorerService {
  constructor(private readonly logger: LoggerService) {}

  async scoreConversation(messageHistory: string[], tenantSlug?: string): Promise<LeadScore> {
    const fullText = (Array.isArray(messageHistory) ? messageHistory : [])
      .join(' ')
      .toLowerCase();

    const urgencyKeywords = ['asap', 'urgent', 'today', 'tomorrow', 'emergency', 'fast', 'now'];

    // ✅ ADD: Spanish urgency variants (add-only)
    urgencyKeywords.push('urgente', 'hoy', 'mañana', 'emergencia', 'rápido', 'ya', 'ahora');

    const budgetKeywords = ['budget', 'price', 'cost', 'afford', '$', 'dollars', 'pesos'];

    // ✅ ADD: Spanish budget variants (add-only)
    budgetKeywords.push('precio', 'costo', 'cuánto', 'cuanto', 'presupuesto', 'rd$', 'dólares', 'dolores');

    const timelineKeywords = ['week', 'month', 'when', 'schedule', 'available'];

    // ✅ ADD: Spanish timeline variants (add-only)
    timelineKeywords.push('semana', 'mes', 'cuándo', 'cuando', 'agenda', 'disponible', 'disponibilidad');

    const foundUrgency = urgencyKeywords.filter((w) => fullText.includes(w));
    const mentionedBudget = budgetKeywords.some((w) => fullText.includes(w));
    const mentionedTimeline = timelineKeywords.some((w) => fullText.includes(w));
    const askedQuestions = (fullText.match(/\?/g) || []).length > 2;

    let score = 50;
    if (mentionedBudget) score += 15;
    if (mentionedTimeline) score += 15;
    if (foundUrgency.length > 0) score += 20;
    if (askedQuestions) score += 10;

    // ✅ ADD: floor protection for very short/empty histories (prevents false spam)
    if (!fullText.trim()) score = 0;

    score = Math.min(score, 100);

    let classification: LeadScore['classification'] = 'cold';
    if (score >= 90) classification = 'hot';
    else if (score >= 70) classification = 'warm';
    else if (score < 30) classification = 'spam';

    this.logger.log(
      JSON.stringify({
        event: 'lead_scored',
        tenantSlug: tenantSlug || 'unknown',
        score,
        classification,
        urgencyKeywords: foundUrgency,
      }),
      'LeadScorerService',
    );

    return {
      score,
      signals: {
        mentionedBudget,
        mentionedTimeline,
        askedDetailedQuestions: askedQuestions,
        urgencyKeywords: foundUrgency,
      },
      classification,
    };
  }
}
