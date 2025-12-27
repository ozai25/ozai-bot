import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS ?? 800),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 30000),
  },
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022',
    maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS ?? 800),
    timeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 30000),
  },
  circuitBreaker: {
    failureThreshold: Number(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? 0.5),
    windowSeconds: Number(process.env.CIRCUIT_BREAKER_WINDOW_SIZE_SECONDS ?? 60),
    openDurationSeconds: Number(process.env.CIRCUIT_BREAKER_OPEN_DURATION_SECONDS ?? 300),
    testIntervalSeconds: Number(process.env.CIRCUIT_BREAKER_TEST_INTERVAL_SECONDS ?? 30),
  },
}));
