// src/lib/engine.ts
// Converts active Signal Board toggles into Finding objects. Original,
// disclosed-fabricated — the whole point of the Signal Board is that a
// human drives every input directly, so every downstream number (entropy,
// feedback loops, risk register) is reproducible and auditable rather than
// hidden behind an opaque generator.
import { RULES_BY_ID } from "./rules";
import type { AppState, Finding } from "./types";

export function buildFindings(state: AppState): Finding[] {
  const findings: Finding[] = [];
  for (const sig of Object.values(state.signals)) {
    if (!sig.active) continue;
    const rule = RULES_BY_ID[sig.ruleId];
    if (!rule) continue;
    findings.push({
      key: sig.personId ? `${sig.ruleId}:${sig.personId}` : sig.ruleId,
      ruleId: sig.ruleId,
      title: rule.title,
      category: rule.category,
      sev: sig.sev,
      score: sig.sev * 20,
      personId: sig.personId,
      ts: sig.lastToggledAt || Date.now(),
      polarity: rule.polarity,
    });
  }
  return findings.sort((a, b) => b.sev - a.sev || b.ts - a.ts);
}
