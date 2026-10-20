// src/lib/domain/terminology.ts — per-org glossary resolution (white-label
// "team" vs "department" vs "squad"). Pure function over plain data.

export const TERMINOLOGY_PRESETS = {
  default: { team: "Team", manager: "Manager", finding: "Finding" },
  startup: { team: "Squad", manager: "Lead", finding: "Signal" },
  enterprise: { team: "Department", manager: "Director", finding: "Issue" },
  nonprofit: { team: "Program Team", manager: "Program Lead", finding: "Observation" },
} as const;

export type TerminologyPresetKey = keyof typeof TERMINOLOGY_PRESETS;

export function presetTerminology(preset: TerminologyPresetKey): Record<string, string> {
  return { ...TERMINOLOGY_PRESETS[preset] };
}

/** Resolve a glossary term for an org, falling back to the default preset then the raw key. */
export function resolveTerm(
  term: string,
  overrides: Record<string, string> | null | undefined,
): string {
  if (overrides && overrides[term]) return overrides[term];
  const fallback = TERMINOLOGY_PRESETS.default as Record<string, string>;
  return fallback[term] ?? term;
}
