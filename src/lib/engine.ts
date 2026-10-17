// Signal Board -> Finding[] projection. Original to this delivery, disclosed
// as a deterministic/fabricated-but-transparent mapping (no ML, no hidden
// model) — it just reads the toggled rules back out as typed Finding
// records, with per-rule severity/person/recurrence overrides applied, so
// the other engines (info theory, CAS, risk) have one consistent shape to
// consume.
import { RULES_BY_ID } from "./rules";
import type { AppState, Finding } from "./types";

export function buildFindings(state: AppState): Finding[] {
  return state.activeRuleIds
    .map((id) => RULES_BY_ID[id])
    .filter(Boolean)
    .map((rule) => ({
      ruleId: rule.id,
      category: rule.category,
      label: rule.label,
      severity: state.severityOverrides[rule.id] ?? rule.defaultSeverity,
      personId: state.personLinks[rule.id],
      recurrence: state.recurrence[rule.id] ?? 0,
      ts: Date.now(),
    }));
}
