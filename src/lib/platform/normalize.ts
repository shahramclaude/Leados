// src/lib/platform/normalize.ts
// Small, dependency-free normalization + similarity helpers shared by the
// quality engine and the MDM entity-resolution matcher.

export function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

/** Strips everything but digits and keeps the trailing 7-15 digits (loose, documented limit: no libphonenumber). */
export function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-15);
}

export function normalizeName(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isValidEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const DISPOSABLE_OR_PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "test.com",
  "n-a.com",
  "none.com",
  "domain.com",
]);

export function isPlaceholderEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && DISPOSABLE_OR_PLACEHOLDER_DOMAINS.has(domain);
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = temp;
    }
  }
  return dp[n];
}

/** Normalized string similarity in [0,1], 1 = identical. */
export function stringSimilarity(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const sa = a.trim().toLowerCase();
  const sb = b.trim().toLowerCase();
  if (sa === sb) return 1;
  const maxLen = Math.max(sa.length, sb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(sa, sb);
  return Math.max(0, 1 - dist / maxLen);
}
