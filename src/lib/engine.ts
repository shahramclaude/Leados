// src/lib/engine.ts
// Signal Board -> Finding[] projection, plus the one metric the pasted
// brief's inference patterns reference (crisisCount). Original to this
// delivery; disclosed-fabricated math (see AI-SESSION-LOG.md).
import type { AppState, Finding } from "./types";
import { RULES } from "./rules";

export function computeFindings(state: AppState): Finding[] {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    const entry = state.signals[rule.id];
    if (!entry || !entry.active) continue;
    if (rule.counter) {
      const n = Math.max(1, entry.occurrences ?? 1);
      for (let i = 0; i < n; i++) findings.push({ rule: rule.id, severity: rule.severity });
    } else {
      findings.push({ rule: rule.id, severity: rule.severity });
    }
  }
  return findings;
}

export function countActive(findings: Finding[], ruleId: string): number {
  return findings.filter((f) => f.rule === ruleId).length;
}

export function computeMetricValue(metric: "crisisCount", state: AppState): number {
  if (metric === "crisisCount") return state.crisisCount;
  return 0;
}
