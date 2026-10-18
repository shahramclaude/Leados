// Lightweight assertion-based test suite for the engine + intelligence
// layer. No test framework dependency — run with: npx tsx src/lib/engine.test.ts

import { project, LeadosEvent, Person } from "./engine";
import { updateBelief } from "./bayesian";
import { runSimulation } from "./simulation";
import { buildAttentionItems, optimizeAttention } from "./attention";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  }
}

let counter = 0;
function mkEvent(
  opts: { type: string; domain: string; data: Record<string, unknown>; personId?: string | null; ts?: Date },
  daysAgo = 0
): LeadosEvent {
  counter++;
  return {
    id: `evt-${counter}`,
    type: opts.type,
    domain: opts.domain,
    data: opts.data,
    personId: opts.personId ?? null,
    ts: opts.ts ?? new Date(Date.now() - daysAgo * 86400000),
  };
}

function mkPerson(overrides: Partial<Person> & { id: string; name: string }): Person {
  return {
    id: overrides.id,
    name: overrides.name,
    role: overrides.role ?? "Engineer",
    reports_to: overrides.reports_to ?? null,
    cadence_days: overrides.cadence_days ?? 14,
    archived: overrides.archived ?? false,
    joined_at: overrides.joined_at ?? new Date(Date.now() - 365 * 86400000),
  };
}

// T1: R16 does not fire when runway is healthy
{
  const events = [mkEvent({ type: "metric", domain: "finance", data: { key: "runway_months", value: 18 } })];
  const { findings } = project(events, []);
  assert(!findings.some((f) => f.rule === "R16"), "T1 FAIL: R16 should not fire with healthy runway");
  console.log("T1 PASS: R16 does not fire when runway is healthy");
}

// T2: R1 fires with 3 skipped 1:1s
{
  const p = mkPerson({ id: "p1", name: "Test Person" });
  const events = [
    mkEvent({ type: "oneonone", domain: "people", data: { personId: "p1", status: "skipped" } }, 10),
    mkEvent({ type: "oneonone", domain: "people", data: { personId: "p1", status: "skipped" } }, 25),
    mkEvent({ type: "oneonone", domain: "people", data: { personId: "p1", status: "skipped" } }, 40),
  ];
  const { findings } = project(events, [p]);
  assert(findings.some((f) => f.rule === "R1"), "T2 FAIL: R1 should fire with 3 skipped 1:1s");
  console.log("T2 PASS: R1 fires with 3 skipped 1:1s in 60d");
}

// T3: R7 burnout fires on high load + low mood
{
  const p = mkPerson({ id: "p2", name: "Burnout Person" });
  const events = [
    mkEvent({ type: "pulse", domain: "people", data: { personId: "p2", mood: 3, load: 9 } }, 5),
    mkEvent({ type: "pulse", domain: "people", data: { personId: "p2", mood: 4, load: 8 } }, 10),
  ];
  const { findings } = project(events, [p]);
  assert(findings.some((f) => f.rule === "R7"), "T3 FAIL: R7 should fire");
  console.log("T3 PASS: R7 burnout signal fires");
}

// T4: engine never throws on garbage data
{
  const events = [mkEvent({ type: "metric", domain: "finance", data: { key: "runway_months", value: "not-a-number" as unknown as number } })];
  let threw = false;
  try {
    project(events, []);
  } catch {
    threw = true;
  }
  assert(!threw, "T4 FAIL: engine should never throw");
  console.log("T4 PASS: engine does not throw on malformed data");
}

// T5: domainScores cover all 8 health domains
{
  const { domainScores } = project([], []);
  assert(domainScores.length === 8, "T5 FAIL: expected 8 domains");
  console.log("T5 PASS: domainScores covers 8 domains");
}

// T6: empty input produces a valid projection (some rules legitimately
// fire on the *absence* of activity — e.g. "no decision logged in 90d" —
// so we assert structural validity rather than zero findings).
{
  const state = project([], []);
  assert(Array.isArray(state.findings), "T6 FAIL");
  assert(state.findings.every((f) => typeof f.rule === "string" && typeof f.sev === "number"), "T6b FAIL");
  console.log("T6 PASS: empty input produces a structurally valid projection");
}

// T7: R16 fires when runway < 6
{
  const events = [mkEvent({ type: "metric", domain: "finance", data: { key: "runway_months", value: 4.5 } })];
  const { findings } = project(events, []);
  assert(findings.some((f) => f.rule === "R16"), "T7 FAIL");
  console.log("T7 PASS: R16 fires when runway < 6");
}

// T8: org health score is between 0-100
{
  const { healthScore } = project([], []);
  assert(healthScore.overall >= 0 && healthScore.overall <= 100, "T8 FAIL");
  console.log("T8 PASS: health score in [0, 100]");
}

// T9: flight risk returns array
{
  const { flightRisk } = project([], []);
  assert(Array.isArray(flightRisk), "T9 FAIL");
  console.log("T9 PASS: flightRisk is array");
}

// T10: no finding has sev outside 1-5
{
  const events = [mkEvent({ type: "metric", domain: "finance", data: { key: "runway_months", value: 3 } })];
  const { findings } = project(events, []);
  assert(findings.every((f) => f.sev >= 1 && f.sev <= 5), "T10 FAIL");
  console.log("T10 PASS: all severities in [1,5]");
}

// T11: correlation clusters returned when multiple rules active
{
  const events = [
    mkEvent({ type: "metric", domain: "finance", data: { key: "ltv_cac", value: 0.8 } }),
    mkEvent({ type: "metric", domain: "sales", data: { key: "pipeline_coverage_x", value: 1.5 } }),
  ];
  const { correlations } = project(events, []);
  assert(Array.isArray(correlations), "T11 FAIL");
  console.log("T11 PASS: correlations is array");
}

// T12: temporal mode is one of the four valid values
{
  const { temporalMode } = project([], []);
  assert(["REACTIVE", "BALANCED", "STRATEGIC_DRIFT", "STRUCTURAL_STRESS"].includes(temporalMode), "T12 FAIL");
  console.log("T12 PASS: temporalMode is valid");
}

// T13: orgEntropy between 0 and 1
{
  const { orgEntropy } = project([], []);
  assert(orgEntropy >= 0 && orgEntropy <= 1, "T13 FAIL");
  console.log("T13 PASS: orgEntropy in [0,1]");
}

// T14: Bayesian updateBelief returns valid posterior
{
  const result = updateBelief("attrition_60d", ["burnout_signal"]);
  assert(result.posterior >= 0 && result.posterior <= 1, "T14 FAIL");
  assert(result.posterior > result.prior, "T14b FAIL: posterior should be > prior with positive evidence");
  console.log("T14 PASS: Bayesian update correct direction");
}

// T15: Simulation returns STATUS_QUO + 3 interventions
{
  const result = runSimulation([], [], new Set(), 4, 10);
  assert("STATUS_QUO" in result.scenarios, "T15 FAIL");
  assert(Object.keys(result.scenarios).length >= 4, "T15b FAIL");
  console.log("T15 PASS: simulation returns all scenarios");
}

// T16: Attention optimizer returns sequence within budget
{
  const items = buildAttentionItems([
    { key: "k1", rule: "R1", domain: "people", sev: 4, title: "Test", detail: "", ref: "r1" },
  ]);
  const plan = optimizeAttention(items, 10, 20, 100);
  assert(plan.totalHours <= 10, "T16 FAIL: exceeded hour budget");
  console.log("T16 PASS: attention optimizer respects budget");
}

if (process.exitCode === 1) {
  console.error("\nSome tests FAILED.");
} else {
  console.log("\nAll tests PASSED.");
}
