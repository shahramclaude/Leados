// Rule engine over the five pt-U domains. Implements a subset of the rule IDs
// named in the task's pasted "pt-U Implementation Summary" (R206–R220) — only
// the ones whose dependencies exist in this session's pasted Part 4–8 content.
// R206/R207 (strategy.doc / "living docs") and R216 (attention optimizer) and
// R220 (living doc staleness) depend on Parts 1–3 modules that were NOT pasted
// into this session, so they are intentionally omitted rather than fabricated —
// disclosed gap, matching the real repo's own established disclosure pattern.
import type { AppState, Finding } from "./types";
import { talent } from "./talent";
import { financialOS } from "./financialOS";
import { regulatory } from "./regulatory";
import { narrativeIntel } from "./narrativeIntel";
import { orgODE } from "./orgODE";
import { daysBetween } from "./store";

export function runEngine(P: AppState, today: Date): Finding[] {
  const findings: Finding[] = [];

  // R208 — no succession candidate for any direct-report role
  const succession = talent.buildSuccessionMap(P);
  succession.criticalRoles
    .filter((role) => !succession.successionMap[role])
    .forEach((role) =>
      findings.push({ rule: "R208", sev: 3, title: `No succession candidate: ${role}`, detail: "No talent.succession.candidate event targets this role at all." })
    );

  // R209 — bench strength < 50%
  if (succession.benchStrength !== null && succession.benchStrength < 50) {
    findings.push({ rule: "R209", sev: 3, title: `Bench strength ${succession.benchStrength}%`, detail: "Fewer than half of critical roles have a ready-now successor." });
  }

  // R210 — capability gap >= 2 for a planned hire
  const capGaps = talent.buildCapabilityGap(P);
  capGaps.criticalGaps.forEach((g) =>
    findings.push({ rule: "R210", sev: 3, title: `Capability gap: ${g.capability}`, detail: `Required level ${g.required}, current max ${g.currentMax} (gap ${g.gap}).` })
  );

  // R211 — GTM > 30% allocation while LTV:CAC < 2
  const unitEcon = financialOS.computeCompleteUnitEconomics(P, today);
  const alloc = financialOS.optimizeCapitalAllocation(P, today);
  const gtm = alloc.allocations.find((a) => a.name === "GTM");
  if (gtm && gtm.allocation > 30 && (unitEcon.ltvCac ?? 0) < 2) {
    findings.push({ rule: "R211", sev: 4, title: "GTM overallocated given weak unit economics", detail: `GTM at ${gtm.allocation}% while LTV:CAC = ${unitEcon.ltvCac}.` });
  }

  // R212 — Rule of 40 < 20
  if (unitEcon.ruleOf40 !== null && unitEcon.ruleOf40 < 20) {
    findings.push({ rule: "R212", sev: 3, title: `Rule of 40 = ${unitEcon.ruleOf40}`, detail: "Growth% + EBITDA margin% below the 20 floor." });
  }

  // R213 — Quick ratio < 2
  if (unitEcon.quickRatio !== null && unitEcon.quickRatio < 2) {
    findings.push({ rule: "R213", sev: 3, title: `Quick ratio = ${unitEcon.quickRatio}`, detail: "New MRR is not outpacing churned MRR by a healthy margin." });
  }

  // R214 — regulatory exposure > 70
  const registry = regulatory.buildObligationRegistry(P, today);
  registry.filter((r) => r.exposure > 70).forEach((r) =>
    findings.push({ rule: "R214", sev: 4, title: `${r.jurisdiction} exposure ${r.exposure}`, detail: r.label })
  );

  // R215 — cross-jurisdiction conflict
  const conflicts = regulatory.detectCrossJurisdictionConflicts(P);
  conflicts.conflicts.forEach((c: any) =>
    findings.push({ rule: "R215", sev: 3, title: `Conflicting interpretation: ${c.framework}`, detail: c.note })
  );

  // R217 — ODE attractor predicts DECLINE
  const ode = orgODE.integrate(P, today, 12);
  if (ode.attractorPrediction.type === "DECLINE") {
    findings.push({ rule: "R217", sev: 4, title: "Org-physics attractor: DECLINE", detail: ode.attractorPrediction.description });
  }

  // R218 — board confusion rate > 40%
  const narrative = narrativeIntel.computeNarrativeEffectiveness(P);
  if (!narrative.insufficient) {
    const board = narrative.audienceStats?.find((a) => a.audience === "board");
    if (board?.confusionRate != null && board.confusionRate > 40) {
      findings.push({ rule: "R218", sev: 3, title: `Board confusion rate ${board.confusionRate}%`, detail: "Board communications are landing unclear more than 40% of the time." });
    }
  }

  // R219 — no narrative.outcome logged in > 60 days
  const outcomes = P.events.filter((e) => e.type === "narrative.outcome");
  const lastOutcome = [...outcomes].sort((a, b) => (a.ts > b.ts ? -1 : 1))[0];
  const gapDays = lastOutcome ? daysBetween(lastOutcome.ts, today) : Infinity;
  if (gapDays > 60) {
    findings.push({ rule: "R219", sev: 2, title: "Narrative feedback loop gap", detail: `${gapDays === Infinity ? "No" : gapDays + "-day"} gap since last narrative.outcome event logged.` });
  }

  return findings.sort((a, b) => b.sev - a.sev);
}
