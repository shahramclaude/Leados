/**
 * app/core/domain/suggestionMath.js — the exact arithmetic and the deterministic
 * ask signatures of the Frontline Improvement-Suggestion Ledger (ADR-0227,
 * `RULE-KZT-01`).
 *
 * Nothing here divides with floats, rounds money, or repairs a row. The two
 * rates the register publishes are EXACT FLOOR BASIS POINTS over exact integer
 * counts, and a rate whose denominator is zero or unreadable is null — printed
 * blank with its reason, never as zero.
 *
 * The rule's signatures are deterministic in the suggestion id alone, so a scan
 * and a post-commit run file the same ask and never two.
 */

/** Floor basis points `numerator * 10000 / denominator`; null when unsupported. */
export function kztBp(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0) return null;
  return Math.floor((n * 10000) / d);
}

/** Deterministic signatures for the rule's asks and markers. */
export const kztResponseSignature = (suggestionId) => `kzt1:response:${String(suggestionId || '').trim()}`;
export const kztTargetSignature = (suggestionId) => `kzt1:target:${String(suggestionId || '').trim()}`;

const KZT_ASK_PREFIX = 'kzt1-ask';

export function kztAskSummary(signature) {
  return `${KZT_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseKztAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(KZT_ASK_PREFIX)) return null;
  const signature = raw.slice(KZT_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}
