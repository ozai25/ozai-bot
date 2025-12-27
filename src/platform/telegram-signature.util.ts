// src/platform/telegram-signature.util.ts
export function getTelegramSecretToken(headers: Record<string, unknown>): string {
  const h = headers ?? {};
  const v =
    (h['x-telegram-bot-api-secret-token'] as unknown) ??
    (h['X-Telegram-Bot-Api-Secret-Token'] as unknown) ??
    (h['x-telegram-bot-api-secret-token'.toLowerCase()] as unknown);

  return String(v ?? '').trim();
}
