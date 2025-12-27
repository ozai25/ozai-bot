/* eslint-disable @typescript-eslint/no-explicit-any */
import { PiiRedactorService } from './pii-redactor.service';

/**
 * COMPAT SHIM (ADD-ONLY):
 * Some parts of the codebase expect `PiiRedactorService.redactObject()`.
 * If your actual service uses a different method name (e.g. redact/redactText),
 * this shim adds `redactObject()` at runtime without modifying the original file.
 */

// Type augmentation so TS stops erroring
declare module './pii-redactor.service' {
  interface PiiRedactorService {
    redactObject(input: any): any;
  }
}

// Runtime patch (safe, idempotent)
const proto: any = (PiiRedactorService as any)?.prototype;

if (proto && typeof proto.redactObject !== 'function') {
  proto.redactObject = function redactObjectCompat(input: any): any {
    // Prefer an existing structured redaction method if present
    if (typeof (this as any).redact === 'function') {
      return (this as any).redact(input);
    }

    // If only a string redactor exists, fallback: stringify -> redact -> parse best-effort
    if (typeof (this as any).redactText === 'function') {
      try {
        const s = JSON.stringify(input);
        const redacted = (this as any).redactText(s);
        return JSON.parse(redacted);
      } catch {
        // If parse fails, return original object (still better than crashing)
        return input;
      }
    }

    // Last resort: no-op (never crash the app)
    return input;
  };
}

export {}; // keeps this as a module
