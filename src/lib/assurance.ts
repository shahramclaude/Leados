// Seam 2: assurance monitors every engine.
//
// Given the latest check per engine, compute a fleet-wide assurance summary.
// Two honesty rules enforced here (see docs/RED-TEAM-FINAL.md #12, #29):
//   - an engine that has never been checked is "unmonitored", never "pass".
//   - a check older than `maxAgeMs` is treated as stale, not as a live pass:
//     an engine cannot stay "green" forever just because nobody re-ran it.
export type EngineResult = "pass" | "fail" | "warn";
export type EngineSeverity = "info" | "warning" | "critical";

export const VALID_RESULTS: EngineResult[] = ["pass", "fail", "warn"];
export const VALID_SEVERITIES: EngineSeverity[] = ["info", "warning", "critical"];

export type EngineStatusInput = {
  engineKey: string;
  result: EngineResult;
  severity: EngineSeverity;
  checkedAt: string | Date;
};

export type AssuranceSummary = {
  total: number;
  passing: number;
  warning: number;
  failing: number;
  stale: number;
  coveragePct: number;
  worstSeverity: EngineSeverity | "none";
  unmonitored: string[];
};

export const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function summarizeAssurance(
  allEngineKeys: string[],
  latestChecks: EngineStatusInput[],
  options: { now?: Date; maxAgeMs?: number } = {},
): AssuranceSummary {
  const now = options.now ?? new Date();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  const checkedKeys = new Set(latestChecks.map((c) => c.engineKey));
  const unmonitored = allEngineKeys.filter((key) => !checkedKeys.has(key));

  let passing = 0;
  let warning = 0;
  let failing = 0;
  let stale = 0;

  const severityRank = { none: 0, info: 1, warning: 2, critical: 3 } as const;
  let worstSeverity: AssuranceSummary["worstSeverity"] = "none";

  for (const check of latestChecks) {
    const ageMs = now.getTime() - new Date(check.checkedAt).getTime();
    const isStale = ageMs > maxAgeMs;
    if (isStale) {
      stale += 1;
    } else if (check.result === "pass") {
      passing += 1;
    } else if (check.result === "warn") {
      warning += 1;
    } else {
      failing += 1;
    }

    const effectiveSeverity = isStale ? "critical" : check.severity;
    if (severityRank[effectiveSeverity] > severityRank[worstSeverity]) {
      worstSeverity = effectiveSeverity;
    }
  }

  if (unmonitored.length > 0 && severityRank[worstSeverity] < severityRank.critical) {
    // An unmonitored engine is itself a critical assurance gap.
    worstSeverity = "critical";
  }

  const coveragePct =
    allEngineKeys.length === 0
      ? 100
      : Math.round(((allEngineKeys.length - unmonitored.length) / allEngineKeys.length) * 10000) /
        100;

  return {
    total: allEngineKeys.length,
    passing,
    warning,
    failing,
    stale,
    coveragePct,
    worstSeverity,
    unmonitored,
  };
}
