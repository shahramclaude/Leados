// js/inference.js (requested module) — implemented here as src/lib/inference.ts
// because this workspace is a TypeScript/Vite project with a single src/App.tsx
// entry point. A plain js/inference.js file sitting alongside it would not be
// imported by anything (the same "orphaned file" failure mode flagged when
// inspecting github.com/wbweve/Leados's own core.ts/intelligence.ts). This file
// IS imported by src/views/InferenceView.tsx and src/lib/autonomous.ts — verified
// by `npm run build` succeeding and by grepping the build output (see README).

import type { Category, Finding, Rule, Severity, SignalBoard } from "./types";
import { RULES } from "./rules";

const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/** Forward-chaining step: active signals -> one Finding per category with >=1 active rule. */
export function runInference(board: SignalBoard): Finding[] {
  const activeByCategory = new Map<Category, Rule[]>();
  for (const rule of RULES) {
    const state = board[rule.id];
    if (!state?.active) continue;
    const list = activeByCategory.get(rule.category) ?? [];
    list.push(rule);
    activeByCategory.set(rule.category, list);
  }

  const findings: Finding[] = [];
  for (const [category, rules] of activeByCategory) {
    let severity: Severity = "low";
    for (const r of rules) {
      const s = board[r.id]?.severity ?? r.baseSeverity;
      severity = maxSeverity(severity, s);
    }
    const amplified = rules.length >= 2;
    findings.push({
      id: `F-${category.replace(/[^A-Z]/g, "").slice(0, 3)}`,
      ruleIds: rules.map((r) => r.id),
      category,
      severity: amplified ? escalate(severity) : severity,
      title: `${category}: ${rules.length} active signal${rules.length > 1 ? "s" : ""}`,
      narrative: buildNarrative(category, rules),
      amplified,
    });
  }

  // Cross-category amplification: if both Workload&Burnout and Trust&Psych
  // Safety have active rules on the same person, raise a combined finding.
  const burnoutPeople = peopleWithActiveCategory(board, "Workload & Burnout");
  const trustPeople = peopleWithActiveCategory(board, "Trust & Psychological Safety");
  const overlap = [...burnoutPeople].filter((p) => trustPeople.has(p));
  if (overlap.length > 0) {
    findings.push({
      id: "F-XCAT-BURNOUT-TRUST",
      ruleIds: [],
      category: "Workload & Burnout",
      severity: "high",
      title: "Cross-category amplification: overload + eroding trust, same person",
      narrative: `${overlap.length} person/people show both sustained overload and declining trust signals — the classic burnout-loop + trust-collapse combination.`,
      amplified: true,
    });
  }

  return findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

function peopleWithActiveCategory(board: SignalBoard, category: Category): Set<string> {
  const set = new Set<string>();
  for (const rule of RULES) {
    if (rule.category !== category) continue;
    const state = board[rule.id];
    if (state?.active && state.personId) set.add(state.personId);
  }
  return set;
}

function escalate(s: Severity): Severity {
  if (s === "low") return "medium";
  if (s === "medium") return "high";
  return "high";
}

function buildNarrative(_category: Category, rules: Rule[]): string {
  const titles = rules.slice(0, 3).map((r) => r.title.toLowerCase());
  return `Active: ${titles.join("; ")}${rules.length > 3 ? `; +${rules.length - 3} more` : ""}.`;
}
