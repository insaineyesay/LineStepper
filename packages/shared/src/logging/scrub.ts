/**
 * Removes personal and payment data before a log leaves the process
 * (PRD: "No email, phone or payment data appears in any connector").
 * Keys are redacted by name; string values are redacted by pattern, so an
 * email pasted into a free-text field is caught too.
 */
const SENSITIVE_KEY = /e-?mail|phone|mobile|password|passwd|secret|token|authorization|cookie|card|cvc|cvv|iban|ssn|dob|birth|address|apikey|api_key/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 13–19 digit runs, optionally split by spaces or dashes (card numbers).
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
// North American and international phone shapes: +1 (757) 555-0100, 757.555.0100, etc.
const PHONE = /(?:\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g;
// Bearer / JWT-looking tokens.
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;

export const REDACTED = '[redacted]';
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

export function scrubString(value: string): string {
  const out = value
    .replace(JWT, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(CARD, REDACTED)
    .replace(PHONE, REDACTED);
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

export function scrub<T>(value: T, depth = 0): T {
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value) as T;
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]' as T;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrub(v, depth + 1);
  }
  return out as T;
}
