// Seam 5: VoC links to strategy.
//
// Groups raw feedback by theme and ranks themes by a simple urgency score
// (volume x negativity) so the highest-signal themes can be matched to an
// existing strategy item, or flagged as needing a new one.
export type VocItem = {
  theme: string;
  sentiment: "positive" | "neutral" | "negative";
};

export type ThemeSignal = {
  theme: string;
  count: number;
  negativeCount: number;
  urgency: number;
};

export function rankVocThemes(items: VocItem[]): ThemeSignal[] {
  const byTheme = new Map<string, { count: number; negativeCount: number }>();
  for (const item of items) {
    const bucket = byTheme.get(item.theme) ?? { count: 0, negativeCount: 0 };
    bucket.count += 1;
    if (item.sentiment === "negative") bucket.negativeCount += 1;
    byTheme.set(item.theme, bucket);
  }

  return Array.from(byTheme.entries())
    .map(([theme, { count, negativeCount }]) => ({
      theme,
      count,
      negativeCount,
      urgency: count * (negativeCount / count || 0.1),
    }))
    .sort((a, b) => b.urgency - a.urgency);
}

export function suggestStrategyLink(
  theme: string,
  existingStrategyTitles: string[],
): { matched: string | null } {
  const normalized = theme.trim().toLowerCase();
  const match = existingStrategyTitles.find((title) => title.toLowerCase().includes(normalized));
  return { matched: match ?? null };
}
