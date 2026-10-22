// Prompt-injection guard for imported data (Part 22 red-team item). Any
// string that originates from an untrusted source — a webhook payload, an
// imported CSV cell, a lead-supplied email signature — is "data", never
// "instructions". This module flags instruction-like phrasing found inside
// untrusted strings so draft-generation tools can refuse to let it steer
// their output, and so the flag is visible in the resulting Explain<T>.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all|any|the)? ?(previous|prior|above) instructions/i,
  /disregard (all|any|the)? ?(previous|prior|above)/i,
  /you are now/i,
  /system prompt/i,
  /act as (an?|the)/i,
  /\bnew instructions\b/i,
  /reveal (your|the) (prompt|instructions)/i,
];

export interface InjectionScanResult {
  suspicious: boolean;
  matches: string[];
}

export function scanForInjectionAttempt(text: string): InjectionScanResult {
  const matches: string[] = [];
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      matches.push(re.source);
    }
  }
  return { suspicious: matches.length > 0, matches };
}

/**
 * Renders an untrusted string as inert quoted data for inclusion in a
 * generated draft. Strips control characters and truncates length so a
 * single oversized payload cannot dominate a generated message.
 */
export function quoteUntrustedData(raw: string, maxLen = 240): string {
  const stripped = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const truncated = stripped.length > maxLen ? `${stripped.slice(0, maxLen)}…` : stripped;
  return `"${truncated.replace(/"/g, "'")}"`;
}
