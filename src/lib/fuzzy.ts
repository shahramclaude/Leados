/**
 * CommandPalette scoring:
 *
 *   score = 0.4 * prefix + 0.3 * subsequence + 0.2 * recency + 0.1 * frequency
 *
 * Each term is normalized to [0, 1] before weighting, so `score` itself is
 * always in [0, 1]. See docs/DESIGN-SYSTEM.md §3.2 for the full contract.
 */

export interface FuzzyUsage {
  /** ms since epoch this item was last activated, or undefined if never. */
  lastUsedAt?: number;
  /** total times this item has been activated. */
  useCount?: number;
}

export interface FuzzyScoreBreakdown {
  prefix: number;
  subsequence: number;
  recency: number;
  frequency: number;
  score: number;
  matched: boolean;
}

const WEIGHTS = { prefix: 0.4, subsequence: 0.3, recency: 0.2, frequency: 0.1 };

/** 1 if `query` is a case-insensitive prefix of `label`, scaled down for
 * partial-length prefixes so "da" scores lower than "dash" against
 * "dashboard". */
function prefixScore(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (!l.startsWith(q)) return 0;
  return Math.min(1, q.length / Math.max(4, Math.min(l.length, 10)));
}

/** Subsequence match (characters of query appear in order within label),
 * scored by how tight/early the match is — classic fuzzy-finder heuristic. */
function subsequenceScore(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;

  let li = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = l.indexOf(ch, li);
    if (found === -1) return 0; // not a subsequence at all
    if (firstIndex === -1) firstIndex = found;
    lastIndex = found;
    li = found + 1;
  }

  const span = lastIndex - firstIndex + 1;
  const density = q.length / span; // tighter match -> closer to 1
  const earliness = 1 - firstIndex / Math.max(1, l.length); // earlier match -> closer to 1
  return Math.max(0, Math.min(1, 0.7 * density + 0.3 * earliness));
}

/** Exponential recency decay, half-life ~ 7 days. */
function recencyScore(lastUsedAt: number | undefined, now: number): number {
  if (!lastUsedAt) return 0;
  const ageMs = Math.max(0, now - lastUsedAt);
  const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

/** Frequency, log-compressed and normalized against a soft ceiling so a
 * single very-frequently-used item cannot dominate forever. */
function frequencyScore(useCount: number | undefined, ceiling = 50): number {
  if (!useCount) return 0;
  return Math.min(1, Math.log1p(useCount) / Math.log1p(ceiling));
}

export function scoreCommand(
  label: string,
  query: string,
  usage: FuzzyUsage = {},
  now: number = Date.now(),
): FuzzyScoreBreakdown {
  const prefix = prefixScore(label, query);
  const subsequence = subsequenceScore(label, query);
  const recency = recencyScore(usage.lastUsedAt, now);
  const frequency = frequencyScore(usage.useCount);

  const matched = query.length === 0 ? true : prefix > 0 || subsequence > 0;

  const score =
    WEIGHTS.prefix * prefix + WEIGHTS.subsequence * subsequence + WEIGHTS.recency * recency + WEIGHTS.frequency * frequency;

  return { prefix, subsequence, recency, frequency, score, matched };
}

export interface ScorableItem {
  id: string;
  label: string;
  keywords?: string[];
}

export function rankCommands<T extends ScorableItem>(
  items: T[],
  query: string,
  usageById: Record<string, FuzzyUsage> = {},
  now: number = Date.now(),
): Array<T & { breakdown: FuzzyScoreBreakdown }> {
  return items
    .map((item) => {
      const haystacks = [item.label, ...(item.keywords ?? [])];
      const best = haystacks
        .map((h) => scoreCommand(h, query, usageById[item.id], now))
        .sort((a, b) => b.score - a.score)[0];
      return { ...item, breakdown: best };
    })
    .filter((item) => item.breakdown.matched)
    .sort((a, b) => b.breakdown.score - a.breakdown.score);
}
