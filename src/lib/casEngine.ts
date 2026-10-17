// src/lib/casEngine.ts — Complex Adaptive Systems layer.
//
// PROVENANCE: the task prompt pasted a "pt-L" implementation summary
// claiming this module already exists as `js/cas_engine.js` inside a
// 58/62-file prior build. That prior build was NOT found anywhere in
// github.com/wbweve/Leados this session (see AI-SESSION-LOG.md §3) — no
// file tree entry, no live import, no string match for `cas_engine`,
// `identifyFeedbackLoops`, `identifyBifurcationPoints`, or `identifyAttractors`
// in any file actually fetched and read this session. This file is
// therefore an ORIGINAL implementation, written fresh for this sandbox to
// satisfy the *functional description* in the pasted brief (which rule IDs
// combine into which named loop/bifurcation), not a port, copy, or
// continuation of unverified prior code.
import { RULES_BY_ID } from "./rules";
import type { AppState, Finding } from "./types";

export type Polarity = "REINFORCING_POSITIVE" | "REINFORCING_NEGATIVE" | "BALANCING";

export interface FeedbackLoop {
  id: string;
  label: string;
  polarity: Polarity;
  rules: string[];
  personId?: string;
  detail: string;
}

/** Finds named feedback loops from combinations of currently-active rule IDs. */
export function identifyFeedbackLoops(findings: Finding[]): FeedbackLoop[] {
  const loops: FeedbackLoop[] = [];
  const active = new Set(findings.map((f) => f.ruleId));
  const byRule = (id: string) => findings.filter((f) => f.ruleId === id);

  // BURNOUT_FEEDBACK_LOOP — R7 (burnout) and R4 (overtime) both active for the same person.
  if (active.has("R7") && active.has("R4")) {
    const r7People = new Set(byRule("R7").map((f) => f.personId).filter(Boolean));
    for (const f of byRule("R4")) {
      if (f.personId && r7People.has(f.personId)) {
        loops.push({
          id: `BURNOUT_FEEDBACK_LOOP:${f.personId}`,
          label: "Burnout feedback loop",
          polarity: "REINFORCING_NEGATIVE",
          rules: ["R7", "R4"],
          personId: f.personId,
          detail: "Sustained overtime (R4) and a burnout risk flag (R7) co-occur on the same person: overtime drives burnout risk, which typically drives more overtime via backfill gaps.",
        });
      }
    }
  }

  // VELOCITY_DEATH_SPIRAL — requires R73 AND R17 at minimum.
  if (active.has("R73") && active.has("R17")) {
    loops.push({
      id: "VELOCITY_DEATH_SPIRAL",
      label: "Velocity death spiral",
      polarity: "REINFORCING_NEGATIVE",
      rules: ["R73", "R17"],
      detail: "Strategic pivot thrash (R73) and declining decision velocity (R17) reinforce each other: thrash makes decisions harder to commit to, which slows velocity, which invites more pivots.",
    });
  }

  // TALENT_VIRTUOUS_CYCLE — two positive PEOPLE signals both active.
  if (active.has("R10") && active.has("R11")) {
    loops.push({
      id: "TALENT_VIRTUOUS_CYCLE",
      label: "Talent virtuous cycle",
      polarity: "REINFORCING_POSITIVE",
      rules: ["R10", "R11"],
      detail: "Strong internal mobility (R10) and high manager trust (R11) reinforce each other: trust enables mobility, mobility signals trustworthy growth paths.",
    });
  }

  // GOVERNANCE_SELF_CORRECTION — a balancing loop: non-conformance plus an active remediation effort.
  if (active.has("R88") && active.has("R90")) {
    loops.push({
      id: "GOVERNANCE_SELF_CORRECTION",
      label: "Governance self-correction",
      polarity: "BALANCING",
      rules: ["R88", "R90"],
      detail: "A compliance non-conformance (R88) is being actively counteracted by a remediation plan in motion (R90) — a balancing loop, not a runaway one.",
    });
  }

  return loops;
}

export interface Bifurcation {
  id: string;
  category: string;
  label: string;
  reversible: boolean;
  detail: string;
}

/** Finds structural "point of no return" conditions. Cultural bifurcation is
 * deliberately NOT implemented: it would require a scoreCulture() function
 * that is never defined anywhere in the pasted brief (same gap the real
 * repo's own prior session found and also declined to invent a fix for —
 * see AI-SESSION-LOG.md §5). */
export function identifyBifurcationPoints(findings: Finding[], runwayMonths: number): Bifurcation[] {
  const out: Bifurcation[] = [];
  const active = new Set(findings.map((f) => f.ruleId));

  if (runwayMonths < 6) {
    out.push({
      id: "FINANCIAL_BIFURCATION",
      category: "FINANCIAL",
      label: "Cash runway bifurcation",
      reversible: true,
      detail: `Runway is ${runwayMonths} months (< 6-month threshold). Reversible: raising capital or cutting burn can still change the trajectory.`,
    });
  }

  if (active.has("R88")) {
    out.push({
      id: "GOVERNANCE_BIFURCATION",
      category: "GOVERNANCE",
      label: "Compliance non-conformance bifurcation",
      reversible: true,
      detail: "R88 active. Reversible: a documented remediation plan can still restore conformance before a regulator or auditor escalates.",
    });
  }

  if (active.has("R9")) {
    out.push({
      id: "TALENT_BIFURCATION",
      category: "PEOPLE",
      label: "Talent bifurcation",
      reversible: false,
      detail: "R9 active (key-person attrition risk, sole owner of a critical system). Not reversible once the person leaves: tacit knowledge is lost, not merely delayed.",
    });
  }

  return out;
}

export interface Attractor {
  key: string;
  ruleId: string;
  recurrences: number;
  label: string;
}

/** A finding is an "attractor" if the same rule has been reactivated at
 * least twice after being switched off — i.e. the system keeps returning to
 * the same state after intervention, rather than resolving permanently. */
export function identifyAttractors(state: AppState): Attractor[] {
  const perRule: Record<string, { lastWasOff: boolean; reactivations: number }> = {};
  for (const entry of state.toggleLog) {
    const bucket = perRule[entry.ruleId] || { lastWasOff: false, reactivations: 0 };
    if (entry.active) {
      if (bucket.lastWasOff) bucket.reactivations += 1;
    } else {
      bucket.lastWasOff = true;
    }
    perRule[entry.ruleId] = bucket;
  }
  const out: Attractor[] = [];
  for (const [ruleId, bucket] of Object.entries(perRule)) {
    if (bucket.reactivations >= 2) {
      const rule = RULES_BY_ID[ruleId];
      out.push({
        key: ruleId,
        ruleId,
        recurrences: bucket.reactivations,
        label: `${ruleId} (${rule?.title ?? "unknown rule"}) has re-activated ${bucket.reactivations}x after being resolved — the system keeps returning to this state.`,
      });
    }
  }
  return out;
}
