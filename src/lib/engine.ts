// src/lib/engine.ts
// Signal Board -> Finding[]. Disclosed-fabricated scoring: score is simply
// severity^1.6 scaled, which is an illustrative convention chosen for this
// sandbox so higher-severity findings dominate the optimizer's benefit
// ranking without a hard cliff. Not a validated risk model.

import { RULES, dependenciesFor } from "./rules";
import type { Finding } from "./types";
import type { SignalState } from "./store";

export function buildFindings(state: SignalState): Finding[] {
  const findings: Finding[] = [];
  for (const r of RULES) {
    if (!state.active[r.rule]) continue;
    const sev = state.sev[r.rule] ?? r.baseSev;
    const score = Math.round(Math.pow(sev, 1.6) * 10) / 10;
    // synthetic "sources" so overlap-based leverage has something to bite on:
    // every finding touches its own category id plus, for person-linked
    // rules, the linked person id.
    const sources = [r.category, ...(r.personLinked ? [state.person[r.rule]] : [])];
    findings.push({
      key: r.rule,
      rule: r.rule,
      category: r.category,
      title: r.title,
      sev,
      score,
      sources,
      person: r.personLinked ? state.person[r.rule] : undefined,
      active: true,
    });
  }
  // Runway-driven synthetic escalation: if runway < 6 months, bump finance
  // findings' severity influence by flagging them (does not mutate sev, the
  // optimizer's urgency function reads runway directly where relevant).
  return findings;
}

export function dependenciesForFinding(rule: string): string[] {
  return dependenciesFor(rule);
}
