// Weak-signal radar: novelty scoring on free text.
//
// Part 11 (embeddings) is not present in this sandbox checkout, so this is
// the documented LEXICAL FALLBACK: n-gram burst detection + co-occurrence
// clustering instead of embedding distance. If/when Part 11 ships, swap
// `scoreNovelty`'s n-gram distance for embedding cosine distance and keep
// the rest of the pipeline (burst stats, clustering, persistence gating)
// unchanged -- the interfaces below are written so that swap is additive.
//
// Thresholds (documented, not hidden in code):
//  - BURST_MIN_VELOCITY = 1.5x baseline rate to count as "active"
//  - PERSISTENCE_DAYS_FOR_TREND = 7 consecutive active days before a theme
//    is allowed to be called a "trend"; before that it stays labeled
//    "signal" no matter how strong the burst looks on a single day.

export const BURST_MIN_VELOCITY = 1.5;
export const PERSISTENCE_DAYS_FOR_TREND = 7;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "was", "were", "it", "this", "that", "with", "as", "at", "by", "be", "has",
  "have", "will", "we", "our", "their", "its", "from", "into", "about",
]);

export interface SignalItemInput {
  id: number;
  text: string;
  ts: string; // ISO
}

export interface ThemeCandidate {
  ngram: string;
  label: string;
  evidenceItemIds: number[];
  evidenceCount: number;
  firstSeen: string;
  lastSeen: string;
  recentCount: number;
  baselineRatePerDay: number;
  recentRatePerDay: number;
  velocity: number; // recentRate / baselineRate
  activeDays: string[]; // YYYY-MM-DD days where the ngram appeared above baseline
  persistenceDays: number;
  status: "signal" | "trend";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Score "novelty" of each distinct n-gram: burst z-score comparing the
 * recent-window daily rate to the baseline-window daily rate (lexical
 * fallback for embedding distance -- see module docstring).
 */
export function mineThemes(
  items: SignalItemInput[],
  options: { recentDays?: number; baselineDays?: number; asOf?: string } = {},
): ThemeCandidate[] {
  if (items.length === 0) return [];
  const recentDays = options.recentDays ?? 3;
  const baselineDays = options.baselineDays ?? 14;
  const asOf = options.asOf ? new Date(options.asOf) : new Date(Math.max(...items.map((i) => new Date(i.ts).getTime())));

  const recentCutoff = new Date(asOf.getTime() - recentDays * 86400000);
  const baselineCutoff = new Date(asOf.getTime() - (recentDays + baselineDays) * 86400000);

  const byNgram = new Map<string, { items: SignalItemInput[]; days: Set<string> }>();

  for (const item of items) {
    const tokens = tokenize(item.text);
    const grams = [...ngrams(tokens, 1), ...ngrams(tokens, 2)];
    const seenInItem = new Set<string>();
    for (const g of grams) {
      if (seenInItem.has(g)) continue;
      seenInItem.add(g);
      const entry = byNgram.get(g) ?? { items: [], days: new Set<string>() };
      entry.items.push(item);
      entry.days.add(dayKey(item.ts));
      byNgram.set(g, entry);
    }
  }

  const themes: ThemeCandidate[] = [];

  for (const [ngram, entry] of byNgram.entries()) {
    if (entry.items.length < 3) continue; // ignore one-off mentions, not enough evidence
    const recentItems = entry.items.filter((i) => new Date(i.ts) > recentCutoff && new Date(i.ts) <= asOf);
    const baselineItems = entry.items.filter((i) => new Date(i.ts) > baselineCutoff && new Date(i.ts) <= recentCutoff);
    const recentRate = recentItems.length / Math.max(1, recentDays);
    const baselineRate = baselineItems.length / Math.max(1, baselineDays) || 1 / baselineDays; // avoid div by 0
    const velocity = recentRate / baselineRate;

    if (velocity < BURST_MIN_VELOCITY || recentItems.length < 2) continue;

    const activeDays = [...entry.days].sort();
    // Count the longest trailing run of consecutive active days up to asOf.
    let persistenceDays = 0;
    const cursor = new Date(asOf);
    for (;;) {
      const key = dayKey(cursor.toISOString());
      if (entry.days.has(key)) {
        persistenceDays++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      } else {
        break;
      }
    }

    const sortedByTs = [...entry.items].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    themes.push({
      ngram,
      label: ngram,
      evidenceItemIds: entry.items.map((i) => i.id),
      evidenceCount: entry.items.length,
      firstSeen: sortedByTs[0].ts,
      lastSeen: sortedByTs[sortedByTs.length - 1].ts,
      recentCount: recentItems.length,
      baselineRatePerDay: baselineRate,
      recentRatePerDay: recentRate,
      velocity,
      activeDays,
      persistenceDays,
      status: persistenceDays >= PERSISTENCE_DAYS_FOR_TREND ? "trend" : "signal",
    });
  }

  // Cluster overlapping n-grams that share >= 60% of their evidence items
  // into a single theme (greedy, highest-evidence-first), picking the
  // highest-velocity ngram's label as the theme label.
  themes.sort((a, b) => b.evidenceCount - a.evidenceCount);
  const clustered: ThemeCandidate[] = [];
  const used = new Set<string>();
  for (const theme of themes) {
    if (used.has(theme.ngram)) continue;
    const group = [theme];
    used.add(theme.ngram);
    const setA = new Set(theme.evidenceItemIds);
    for (const other of themes) {
      if (used.has(other.ngram)) continue;
      const setB = new Set(other.evidenceItemIds);
      const intersection = [...setA].filter((x) => setB.has(x)).length;
      const overlap = intersection / Math.min(setA.size, setB.size);
      if (overlap >= 0.6) {
        group.push(other);
        used.add(other.ngram);
      }
    }
    const best = group.reduce((a, b) => (b.velocity > a.velocity ? b : a));
    const allIds = new Set<number>();
    group.forEach((g) => g.evidenceItemIds.forEach((id) => allIds.add(id)));
    clustered.push({
      ...best,
      label: group.map((g) => g.ngram).sort((a, b) => a.length - b.length)[0],
      evidenceItemIds: [...allIds],
      evidenceCount: allIds.size,
    });
  }

  return clustered.sort((a, b) => b.velocity - a.velocity);
}
