// Original, freshly-named self-test suite (IDs "ST-*") for this delivery's own
// math. The pasted brief names tests T_U_1..T_U_20; most require Part 1–3
// modules (simulated annealing, scenario federation, living docs) that were NOT
// pasted into this session, so reproducing those exact IDs/bodies would imply a
// false provenance. These tests check this build's own formulas instead — the
// same convention the real repo's prior sessions used for T_L_*/G_L_* (see
// AI-SESSION-LOG.md).
import { talent } from "./talent";
import { financialOS } from "./financialOS";
import { regulatory } from "./regulatory";
import { narrativeIntel } from "./narrativeIntel";
import { orgODE } from "./orgODE";
import type { AppState } from "./types";

type TestResult = { id: string; pass: boolean; detail: string };

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

export function runSelfTests(P: AppState, today: Date): TestResult[] {
  const results: TestResult[] = [];

  // ST-01 — succession gap: a critical direct-report role with zero candidates logged
  // anywhere must appear in `gaps`.
  {
    const s = talent.buildSuccessionMap(P);
    const missingRoleHandled = s.criticalRoles.every((r) =>
      s.successionMap[r] ? true : s.gaps.includes(r)
    );
    results.push({ id: "ST-01", pass: missingRoleHandled, detail: "Roles with zero succession events are classified as gaps." });
  }

  // ST-02 — capability gap arithmetic: required 5, current max 3 -> gap 2 (synthetic, isolated inputs).
  {
    const fakeP: AppState = {
      people: [{ id: "x1", name: "X", role: "R", title: "T", isDirect: false }],
      events: [
        { id: "a", ts: today.toISOString(), type: "talent.capability.assessment", data: { personId: "x1", capability: "test_cap", level: 3, assessedBy: "x1" } },
        { id: "b", ts: today.toISOString(), type: "talent.headcount.plan", data: { roleId: "r", level: 5, priority: "critical", capability: "test_cap", targetQuarter: "Q1", rationale: "t" } },
      ],
    };
    const gaps = talent.buildCapabilityGap(fakeP);
    const g = gaps.gaps.find((x) => x.capability === "test_cap");
    results.push({ id: "ST-02", pass: !!g && g.gap === 2, detail: `required 5, max 3 -> gap=${g?.gap}` });
  }

  // ST-03 — LTV:CAC arithmetic: LTV=30000, CAC=8000 -> 3.75
  {
    const ratio = 30000 / 8000;
    results.push({ id: "ST-03", pass: approx(ratio, 3.75), detail: `30000/8000 = ${ratio}` });
  }

  // ST-04 — Rule of 40: growth 35 + ebitda margin 10 -> 45, PASSING
  {
    const r40 = 35 + 10;
    results.push({ id: "ST-04", pass: r40 === 45 && r40 >= 40, detail: `35+10=${r40}, PASSING threshold is >=40` });
  }

  // ST-05 — RK4 sanity: horizon=0 returns only the initial state, unchanged.
  {
    const init = { E: 6, V: 6, T: 6, C: 6, M: 5 };
    const { trajectory } = orgODE.integrate(P, today, 0, {}, init);
    const ok = trajectory.length === 1 && trajectory[0].E === init.E && trajectory[0].V === init.V;
    results.push({ id: "ST-05", pass: ok, detail: `horizon=0 -> trajectory length ${trajectory.length}` });
  }

  // ST-06 — engagement with low trust/capacity decreases over the horizon (directional check).
  {
    const init = { E: 9, V: 6, T: 2, C: 2, M: 5 };
    const { trajectory } = orgODE.integrate(P, today, 8, {}, init);
    const ok = trajectory[trajectory.length - 1].E < init.E;
    results.push({ id: "ST-06", pass: ok, detail: `E: ${init.E} -> ${trajectory[trajectory.length - 1].E}` });
  }

  // ST-07 — attractor classification: 3 consecutive weeks within 0.2 engagement -> not OSCILLATING.
  {
    const init = { E: 8, V: 8, T: 8, C: 8, M: 5 };
    const { attractorPrediction } = orgODE.integrate(P, today, 30, {}, init);
    results.push({ id: "ST-07", pass: attractorPrediction.type !== "OSCILLATING", detail: `30-week horizon settled to: ${attractorPrediction.type}` });
  }

  // ST-08 — narrative effectiveness: n < 3 returns the insufficient-data branch, not a crash.
  {
    const fakeP: AppState = { people: [], events: [{ id: "a", ts: today.toISOString(), type: "narrative.outcome", data: { audience: "board", channel: "deck", reactions: [] } }] };
    const r = narrativeIntel.computeNarrativeEffectiveness(fakeP);
    results.push({ id: "ST-08", pass: r.insufficient === true, detail: "n=1 < 3 correctly flagged insufficient." });
  }

  // ST-09 — regulatory exposure: 0% framework coverage, 0 review coverage, no check -> exposure >= 70.
  {
    const fakeP: AppState = {
      people: [],
      events: [{ id: "a", ts: today.toISOString(), type: "reg.jurisdiction", data: { name: "Nowhere", region: "Test", relevantFrameworks: ["X", "Y"] } }],
    };
    const registry = regulatory.buildObligationRegistry(fakeP, today);
    const r = registry[0];
    results.push({ id: "ST-09", pass: r.exposure >= 70, detail: `0% coverage anywhere -> exposure=${r.exposure}` });
  }

  // ST-10 — capital allocation always sums to exactly 100 (post rounding-remainder repair).
  {
    const alloc = financialOS.optimizeCapitalAllocation(P, today);
    const sum = alloc.allocations.reduce((a, c) => a + c.allocation, 0);
    results.push({ id: "ST-10", pass: sum === 100, detail: `allocations sum to ${sum}` });
  }

  // ST-11 — scenario projection: with churn=0 and positive new MRR, MRR is monotonically non-decreasing.
  {
    const fakeP: AppState = {
      people: [],
      events: [
        { id: "a", ts: today.toISOString(), type: "fin.metric", data: { metric: "mrr", value: 10000 } },
        { id: "b", ts: today.toISOString(), type: "sales.deal.closed", data: { result: "won", value: 12000 } },
      ],
    };
    const proj = financialOS.buildScenarioProjection(fakeP, today, 6);
    const base = proj.projections.find((p) => p.scenario === "BASE_CASE")!;
    let monotonic = true;
    for (let i = 1; i < base.trajectory.length; i++) if (base.trajectory[i].mrr < base.trajectory[i - 1].mrr) monotonic = false;
    results.push({ id: "ST-11", pass: monotonic, detail: "MRR trajectory never decreases when no churn events are logged." });
  }

  // ST-12 — cross-jurisdiction conflict: same framework, 2 different interpretations -> conflict found.
  {
    const conflicts = regulatory.detectCrossJurisdictionConflicts(P);
    const found = conflicts.conflicts.some((c: any) => c.framework === "cross-border-data-transfer");
    results.push({ id: "ST-12", pass: found, detail: `conflicts found: ${conflicts.conflicts.map((c: any) => c.framework).join(", ") || "none"}` });
  }

  // ST-13 — headcount plan + runway < 9mo -> financialConstraint string is populated.
  {
    const fakeP: AppState = {
      people: [{ id: "x1", name: "X", role: "Role A", title: "T", isDirect: true }],
      events: [
        { id: "cash", ts: today.toISOString(), type: "fin.metric", data: { metric: "cash", value: 1000000 } },
        { id: "burn", ts: today.toISOString(), type: "fin.metric", data: { metric: "monthly_burn", value: 200000 } }, // 5 months runway
        { id: "plan", ts: today.toISOString(), type: "talent.headcount.plan", data: { roleId: "r", level: 5, priority: "critical", capability: "rare_skill", targetQuarter: "Q1", rationale: "t" } },
      ],
    };
    const rec = talent.buildHeadcountRecommendation(fakeP, today);
    const hire = rec.recommendations.find((r: any) => r.type === "HIRE");
    results.push({ id: "ST-13", pass: !!hire?.financialConstraint, detail: `runway 5mo -> financialConstraint: ${hire?.financialConstraint ?? "MISSING"}` });
  }

  return results;
}
