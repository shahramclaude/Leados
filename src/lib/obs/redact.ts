// PII / secret redaction applied to every structured log line before it is
// written. Pattern-based (not an allowlist) because the log payload shape is
// not fully known ahead of time — default to redacting, not to leaking.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Bearer / API tokens
  { name: "bearer_token", re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi },
  { name: "openai_key", re: /\bsk-[A-Za-z0-9]{16,}\b/g },
  { name: "generic_api_key", re: /\b[A-Za-z0-9_-]*api[_-]?key[A-Za-z0-9_-]*\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/]{8,}['"]?/gi },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "password_field", re: /("?password"?\s*[:=]\s*")([^"]+)(")/gi },
  { name: "connection_string_password", re: /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi },
  // Emails — partially redact (keep domain for debuggability, mask local part)
  { name: "email", re: /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g },
  // Credit-card-shaped numbers
  { name: "ccn", re: /\b(?:\d[ -]*?){13,16}\b/g },
];

export const REDACTED = "[REDACTED]";

export function redactString(input: string): string {
  let out = input;
  out = out.replace(SECRET_PATTERNS[0].re, `Bearer ${REDACTED}`);
  out = out.replace(SECRET_PATTERNS[1].re, REDACTED);
  out = out.replace(SECRET_PATTERNS[2].re, (m) => m.split(/[:=]/)[0] + "=" + REDACTED);
  out = out.replace(SECRET_PATTERNS[3].re, REDACTED);
  out = out.replace(SECRET_PATTERNS[4].re, REDACTED);
  out = out.replace(SECRET_PATTERNS[5].re, (_m, p1: string, _p2: string, p3: string) => `${p1}${REDACTED}${p3}`);
  out = out.replace(SECRET_PATTERNS[6].re, (_m, p1: string, _p2: string, p3: string) => `${p1}${REDACTED}${p3}`);
  out = out.replace(SECRET_PATTERNS[7].re, (_m, p1: string, p2: string) => `${p1}***${p2}`);
  out = out.replace(SECRET_PATTERNS[8].re, REDACTED);
  return out;
}

const SENSITIVE_KEY_NAMES = new Set([
  "password",
  "pass",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "ssn",
  "dob",
]);

/** Recursively redact a JSON-ish value: known-sensitive keys are nuked
 * outright, every string value is scanned for secret-shaped substrings. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_NAMES.has(k.toLowerCase())) {
        out[k] = REDACTED;
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}
