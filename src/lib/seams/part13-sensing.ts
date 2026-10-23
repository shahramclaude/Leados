// SEAM ADAPTER — Part 13 (Sensing) & Part 34 (External Connectors)
//
// STATUS: neither present in this repo snapshot. "Early-warning for external
// events" is specified as "Part 13's sensing extended with external sources
// (news/registry seams)". This adapter defines the assumed sensing contract:
// a stream of raw external observations that Part 50's radar ingestion
// pipeline (`src/lib/radar/signals.ts`) scores for reliability and checks for
// crisis-threshold breaches. The local implementation reads from the
// `external_sources` / `external_signals` tables Part 50 defines itself,
// clearly labeled as a Part-50-owned fixture feed rather than a read of
// Part 13's real sensing code.

export interface RawExternalObservation {
  sourceName: string;
  sourceType: "news" | "registry" | "licensed_dataset" | "regulator";
  title: string;
  summary: string;
  signalType: string;
  severityHint: "low" | "moderate" | "high" | "critical";
  publishedAt: string; // ISO date
}

export function sensingNotAvailableNotice(): string {
  return (
    "Part 13 sensing + Part 34 connector modules not present in this repo " +
    "snapshot. External Radar below runs on Part 50's own ingestion " +
    "pipeline against seeded/fixture external sources, clearly labeled by " +
    "evidence class and reliability tier — not a read of Part 13/34 code."
  );
}
