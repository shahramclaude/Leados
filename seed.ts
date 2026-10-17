import * as store from "./store";
import { hasData } from "./store";

/**
 * Hand-placed seed data — disclosed fabrication, not real organizational
 * data. Every event below lands in the log via appendAt(), which the
 * store module marks meta.seeded = true unconditionally.
 *
 * The LEGAL domain's six signal.raised events are deliberately tuned so
 * that, as of "now", LEADOS.correlate.measureVelocity('legal', …) lands
 * close to the illustrative numbers in this task's own prompt
 * (score ≈5.2, velocity ≈+0.070/d, 30d projection ≈7.3). The arithmetic
 * is shown live in the UI's "score math" panels — nothing is hard-coded
 * to display those numbers; they fall out of the seeded event ages and
 * the 0.85/day decay. Because "now" moves every day this runs, exact
 * digits will drift slightly — that drift is the system working as
 * designed, not a bug.
 */

function daysAgoIso(n: number, hour = 9): string {
  const d = new Date(Date.now() - n * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function seedIfEmpty() {
  if (hasData()) return;

  const put = store.appendAt;

  // ---- People (8), one broken reporting line (Ghost -> nonexistent id) ----
  put("person.added", { id: "p-ceo", name: "Dana Reyes", title: "CEO", reportsTo: null, createdAt: daysAgoIso(900) }, daysAgoIso(900));
  put("person.added", { id: "p-vpe", name: "Marcus Lin", title: "VP Engineering", reportsTo: "p-ceo", createdAt: daysAgoIso(500) }, daysAgoIso(500));
  put("person.added", { id: "p-vps", name: "Priya Shah", title: "VP Sales", reportsTo: "p-ceo", createdAt: daysAgoIso(400) }, daysAgoIso(400));
  put("person.added", { id: "p-eng1", name: "Jordan Kim", title: "Eng Lead", reportsTo: "p-vpe", createdAt: daysAgoIso(200) }, daysAgoIso(200));
  put("person.added", { id: "p-eng2", name: "Sam Okafor", title: "Engineer", reportsTo: "p-vpe", createdAt: daysAgoIso(60) }, daysAgoIso(60));
  put("person.added", { id: "p-sales1", name: "Alicia Cruz", title: "AE", reportsTo: "p-vps", createdAt: daysAgoIso(150) }, daysAgoIso(150));
  put("person.added", { id: "p-sales2", name: "Tom Becker", title: "AE", reportsTo: "p-vps", createdAt: daysAgoIso(30) }, daysAgoIso(30));
  put("person.added", { id: "p-ghost", name: "Ravi Desai", title: "Contractor PM", reportsTo: "p-missing", createdAt: daysAgoIso(90) }, daysAgoIso(90));

  // ---- Domain signals (Part 1 velocity calibration) ----
  const legal: [number, number, string][] = [
    [33, 3.0, "Vendor DPA clause flagged by counsel"],
    [32, 1.8, "Contract renewal ambiguity noted"],
    [14, 2.0, "Regulatory inquiry opened (info only)"],
    [8, 3.0, "Compliance audit finds a gap"],
    [3, 4.0, "Formal regulator notice received"],
    [1, 2.0, "Outside counsel flags escalation risk"],
  ];
  legal.forEach(([d, sev, title]) => put("signal.raised", { domain: "legal", severity: sev, title }, daysAgoIso(d)));

  const people: [number, number, string][] = [
    [33, 4.0, "Attrition spike in eng org"],
    [31, 3.0, "Engagement survey dipped"],
  ];
  people.forEach(([d, sev, title]) => put("signal.raised", { domain: "people", severity: sev, title }, daysAgoIso(d)));

  const finance: [number, number, string][] = [
    [5, 1.5, "Minor budget variance"],
    [15, 1.5, "Forecast off by a few points"],
    [25, 1.5, "KPI slightly under target"],
    [35, 1.5, "Budget variance noted"],
    [45, 1.5, "Forecast accuracy check"],
  ];
  finance.forEach(([d, sev, title]) => put("signal.raised", { domain: "finance", severity: sev, title }, daysAgoIso(d)));

  const ops: [number, number, string][] = [
    [5, 3.0, "SLA breach on one queue"],
    [15, 2.0, "Incident: brief outage"],
    [28, 1.0, "Capacity warning"],
    [31, 1.0, "Minor process gap"],
  ];
  ops.forEach(([d, sev, title]) => put("signal.raised", { domain: "ops", severity: sev, title }, daysAgoIso(d)));

  put("signal.raised", { domain: "strategy", severity: 2.0, title: "Roadmap slip noted once" }, daysAgoIso(60));

  // ---- Goals: resonance (goal.progress, AMPLIFYING) + entropy inputs ----
  put("goal.set", { id: "g1", title: "Ship v2 onboarding", domain: "ops", ownerId: "p-eng1" }, daysAgoIso(65));
  put("goal.progress", { goalId: "g1", note: "kickoff" }, daysAgoIso(60));
  put("goal.progress", { goalId: "g1", note: "milestone 1" }, daysAgoIso(45));
  put("goal.progress", { goalId: "g1", note: "milestone 2" }, daysAgoIso(29));

  put("goal.set", { id: "g2", title: "Expand EU pipeline", domain: "strategy", ownerId: "p-sales1" }, daysAgoIso(14));
  put("goal.progress", { goalId: "g2", note: "first calls" }, daysAgoIso(12));
  put("goal.progress", { goalId: "g2", note: "two deals in motion" }, daysAgoIso(6));
  put("goal.progress", { goalId: "g2", note: "proposal sent" }, daysAgoIso(1));

  put("goal.set", { id: "g3", title: "Rework comp bands", domain: "people", ownerId: null }, daysAgoIso(50)); // ownerless
  put("goal.set", { id: "g4", title: "Vendor consolidation", domain: "ops", ownerId: "p-vpe" }, daysAgoIso(70)); // silent, no progress ever
  put("goal.set", { id: "g5", title: "Q3 security review", domain: "ops", ownerId: "p-eng2" }, daysAgoIso(40));
  put("goal.closed", { goalId: "g5", result: "achieved" }, daysAgoIso(10)); // recent win
  put("goal.set", { id: "g6", title: "Rebrand launch", domain: "strategy", ownerId: "p-sales2" }, daysAgoIso(90));
  put("goal.closed", { goalId: "g6", result: "missed" }, daysAgoIso(50)); // outside 30d win window

  // ---- Decisions: 4 total (insufficient for resonance by design) ----
  put("decision.logged", { id: "d1", title: "Switch payroll vendor", domain: "ops" }, daysAgoIso(40));
  put("decision.outcome", { decisionId: "d1", outcome: "approved" }, daysAgoIso(35));
  put("decision.logged", { id: "d2", title: "Expand EU entity", domain: "legal" }, daysAgoIso(10)); // open, not yet stale
  put("decision.logged", { id: "d3", title: "Re-platform billing", domain: "finance" }, daysAgoIso(30)); // open, stale (>21d)
  put("decision.logged", { id: "d4", title: "Hire 2nd recruiter", domain: "people" }, daysAgoIso(5));
  put("decision.outcome", { decisionId: "d4", outcome: "approved" }, daysAgoIso(2));

  // ---- Commitments: 6 total, declining frequency (resonance FADING) ----
  put("commitment.made", { id: "c1", ownerId: "p-vpe", desc: "Fix onboarding bug", by_date: daysAgoIso(10) }, daysAgoIso(70)); // overdue
  put("commitment.made", { id: "c2", ownerId: "p-vps", desc: "Send Q3 pricing deck", by_date: daysAgoIso(20) }, daysAgoIso(65)); // overdue
  put("commitment.made", { id: "c3", ownerId: "p-eng1", desc: "Patch security gap", by_date: daysAgoIso(55) }, daysAgoIso(60));
  put("commitment.resolved", { commitmentId: "c3" }, daysAgoIso(50));
  put("commitment.made", { id: "c4", ownerId: "p-sales1", desc: "Renew key account", by_date: daysAgoIso(25) }, daysAgoIso(30));
  put("commitment.resolved", { commitmentId: "c4" }, daysAgoIso(20));
  put("commitment.made", { id: "c5", ownerId: "p-eng2", desc: "Ship perf fix", by_date: daysAgoIso(-10) }, daysAgoIso(15)); // not yet due
  put("commitment.made", { id: "c6", ownerId: "p-vpe", desc: "Rewrite on-call runbook", by_date: daysAgoIso(-20) }, daysAgoIso(1)); // not yet due

  // ---- Information pipelines: 8 checks evenly spaced (resonance STABLE) ----
  const pipelines = [
    ["pipe-rev", "Weekly revenue rollup"],
    ["pipe-inc", "Incident reports to leadership"],
    ["pipe-eng", "Eng status to board"],
  ];
  const checkDays = [56, 49, 42, 35, 28, 21, 14, 7];
  checkDays.forEach((d, i) => {
    const [id, name] = pipelines[i % pipelines.length];
    const blocked = d === 42 || d === 7;
    put("info.pipeline.check", { pipelineId: id, name, blocked }, daysAgoIso(d));
  });

  // ---- Culture signals: 8 evenly spaced (resonance STABLE), mostly positive ----
  const cultureDays = [64, 56, 48, 40, 32, 24, 16, 8];
  cultureDays.forEach((d, i) => {
    const polarity = i === 2 || i === 5 ? "negative" : "positive";
    put("culture.signal", { polarity, note: polarity === "positive" ? "Team shoutout in standup" : "Friction reported in retro" }, daysAgoIso(d));
  });

  // ---- Wins / energy sources ----
  put("ops.milestone.updated", { milestoneId: "m1", status: "done", note: "Launched on schedule" }, daysAgoIso(9));
  put("plan.closed", { planId: "pl1", result: "achieved" }, daysAgoIso(6));
  put("conflict.resolved", { id: "cf1", note: "Eng/Sales roadmap conflict resolved" }, daysAgoIso(18));
  put("conflict.resolved", { id: "cf2", note: "Comp dispute resolved" }, daysAgoIso(80));

  // ---- Process log (material for the Inertia calculator's process picker) ----
  put("ops.process.logged", { id: "proc-oncall", name: "On-call rotation", age_months: 14 }, daysAgoIso(420));
  put("ops.process.logged", { id: "proc-deal-desk", name: "Deal desk approval", age_months: 8 }, daysAgoIso(240));
  put("ops.process.logged", { id: "proc-perf-review", name: "Performance review cycle", age_months: 20 }, daysAgoIso(600));
}
