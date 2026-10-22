// PII / secret redaction for structured logs and trace attributes.
//
// Two layers:
//  1. Key-based: any object key matching SENSITIVE_KEY_PATTERN has its value
//     replaced wholesale, regardless of content.
//  2. Value-based: string values are scanned for secret-shaped tokens
//     (API keys, bearer tokens, connection strings) and PII-shaped tokens
//     (emails, phone numbers, SSN-like sequences, credit-card-like sequences)
//     and those substrings are masked even if the key name looks innocuous.
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|api[-_]?key|authorization|auth|credential|private[-_]?key|ssn|social[-_]?security|dob|date[-_]?of[-_]?birth|cvv|card[-_]?number)/i;

const VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Bearer / JWT-ish tokens
  { name: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._-]{10,}\b/gi },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\b/g },
  // Common provider key prefixes
  { name: "provider-key", re: /\b(sk|pk|rk|api)-[A-Za-z0-9]{16,}\b/gi },
  // Postgres / generic connection strings with embedded credentials
  { name: "conn-string", re: /\b\w+:\/\/[^\s:@/]+:[^\s:@/]+@[^\s/]+/g },
  // Emails
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Phone numbers (loose, international-ish; no leading \b so a leading "+"
  // sign is captured rather than left dangling outside the redacted span)
  { name: "phone", re: /\+?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b/g },
  // SSN-like 9 digit with dashes
  { name: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  // Credit-card-like 13-19 digit sequences
  { name: "ccn", re: /\b(?:\d[ -]*?){13,19}\b/g },
];

export const REDACTED = "[REDACTED]";

function redactString(value: string): string {
  let out = value;
  for (const { re } of VALUE_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/** Deep-clone + redact a structured payload before it is logged or stored. */
export function redact<T>(payload: T): T {
  return redactValue(payload) as T;
}
