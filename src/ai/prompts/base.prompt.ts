export abstract class BasePrompt {
  abstract readonly tenantSlug: string;
  abstract buildSystemPrompt(): string;

  protected join(lines: string[]): string {
    return lines.filter(Boolean).join('\n');
  }
}
