// scripts/test-fairness.ts  ->  `npm run test:fairness`
//
// Seeds a synthetic org with a known group distribution (see
// src/lib/people/seedOrg.ts for exactly why that group label is NOT a
// protected attribute), runs every real people computation this part ships
// against it, and emits a fairness report with gates. Gate failures are
// printed and tracked, never swallowed — see the "known-biased fixture"
// section below for a deliberate demonstration of that.

import { mkdirSync, writeFileSync } from "fs";
import { effectiveLevelsForPerson } from "../src/lib/people/skillsInference";
import { fit, namedGaps, ROLES_BY_ID } from "../src/lib/people/roleSkillMap";
import { computeReadiness } from "../src/lib/people/careers";
import { cognitiveLoad } from "../src/lib/people/loadBalancer";
import { computeGap, SEED_BANDS, bandAggregate, type CompensationGap } from "../src/lib/people/compensation";
import { getWorkloadSnapshot } from "../src/lib/twin/workloadFeed";
import { generateSeedOrg } from "../src/lib/people/seedOrg";
import { auditOutcome, auditPrediction, generateFairnessReport, formatReportAsText, type ComputationAudit } from "../src/lib/intelligence/fairness/report";
import { kAnonymitySuppress } from "../src/lib/intelligence/fairness/metrics";
import { assert, assertEqual, test, runAll } from "./lib/testKit";

const NOW = new Date("2026-01-15T00:00:00Z");
const org = generateSeedOrg(NOW);

const evidenceByPerson = new Map<string, typeof org.skillEvidence>();
for (const row of org.skillEvidence) {
  if (!evidenceByPerson.has(row.personId)) evidenceByPerson.set(row.personId, []);
  evidenceByPerson.get(row.personId)!.push(row);
}

const cohortByPerson = new Map(org.cohorts.map((c) => [c.personId, c.cohort]));
const compByPerson = new Map(org.compensation.map((c) => [c.employeeId, c]));

interface PersonComputationRow {
  personId: string;
  cohort: string;
  readyNow: boolean;
  fitGe07: boolean;
  underpaid5pct: boolean;
  highLoad: boolean;
}

const perPersonRows: PersonComputationRow[] = [];

for (const personId of Object.keys(org.archetypeRoleByPerson)) {
  const cohort = cohortByPerson.get(personId);
  if (!cohort || cohort === "cohort-micro") continue; // micro cohort handled separately as the k-anonymity demo, never pooled into a <30-sample gate

  const evidence = evidenceByPerson.get(personId) ?? [];
  const effectiveLevels = effectiveLevelsForPerson(personId, evidence);
  const role = ROLES_BY_ID[org.archetypeRoleByPerson[personId]];
  const fitScore = fit(effectiveLevels, role);
  const readiness = computeReadiness(personId, effectiveLevels, role);

  const workload = getWorkloadSnapshot(personId, "2026-01-15");
  const load = cognitiveLoad(workload);

  const comp = compByPerson.get(personId);
  const band = SEED_BANDS.find((b) => b.id === comp?.bandId);
  let underpaid5pct = false;
  if (comp && band) {
    const gap = computeGap(comp, band);
    underpaid5pct = gap.gapToMidPct >= 5;
  }

  perPersonRows.push({
    personId,
    cohort,
    readyNow: readiness.state === "ready-now",
    fitGe07: fitScore >= 0.7,
    underpaid5pct,
    highLoad: load.band === "high" || load.band === "critical",
  });
}

function toOutcomeRows(selector: (r: PersonComputationRow) => boolean) {
  return perPersonRows.map((r) => ({ group: r.cohort, outcome: selector(r) }));
}

const computations: ComputationAudit[] = [
  auditOutcome(
    "succession-readiness-ready-now",
    "Share of people whose current skill evidence meets every core-skill bar for their archetype role (ready-now succession state). Computed purely from skill evidence; no protected attribute enters this computation.",
    toOutcomeRows((r) => r.readyNow),
  ),
  auditOutcome(
    "role-fit-shortlist-threshold",
    "Share of people whose weighted role-fit score for their archetype role is >= 0.7 — the same threshold the Team Composer uses to consider someone a plausible addition.",
    toOutcomeRows((r) => r.fitGe07),
  ),
  auditOutcome(
    "compensation-underpaid-vs-band-mid",
    "Share of people paid 5%+ below their compensation band midpoint. Pay is generated independently of cohort in the seed data; this checks whether the metric correctly detects (the absence of) disparity.",
    toOutcomeRows((r) => r.underpaid5pct),
  ),
  auditOutcome(
    "workload-high-cognitive-load",
    "Share of people whose twin-proxy-derived cognitive load score is in the 'high' or 'critical' band on the snapshot date.",
    toOutcomeRows((r) => r.highLoad),
  ),
];

// --- Deliberate known-biased synthetic fixture -----------------------------
// This block exists ONLY to prove the gate mechanism correctly reports a
// failure instead of hiding it (Phase 4 gate requires failures be tracked,
// never hidden). It is NOT derived from any real LEADOS computation or any
// real person's data. Fully deterministic — no Math.random() anywhere in
// this part.
function deterministicBiasedFixture() {
  const rows: { group: string; outcome: boolean }[] = [];
  for (let i = 0; i < 40; i++) rows.push({ group: "synthetic-group-a", outcome: i < 36 }); // 90%
  for (let i = 0; i < 40; i++) rows.push({ group: "synthetic-group-b", outcome: i < 24 }); // 60%
  return rows;
}
const biasedFixtureRows = deterministicBiasedFixture();
computations.push(
  auditOutcome(
    "synthetic-selftest-known-biased-fixture",
    "NOT a real computation. Deliberately constructed 90% vs 60% positive-rate fixture (n=40 each) to prove the fairness gate reports a FAIL rather than hiding it.",
    biasedFixtureRows,
  ),
);

// --- Calibration/equalized-odds metric self-test ---------------------------
// LEADOS does not ship any individually-scored predictive model of a future
// human outcome (that is a deliberate product decision — see
// AI-SESSION-LOG.md Phase 5). Equalized-odds and calibration-by-group are
// still implemented and must be proven correct, so we exercise them here
// against a synthetic, clearly-labelled numeric fixture with a small,
// intentional, sub-threshold gap — not against any person's data.
function deterministicPredictionFixture() {
  const rows: { group: string; predictedProb: number; label: boolean }[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (const group of ["synthetic-group-a", "synthetic-group-b"]) {
    for (let i = 0; i < 60; i++) {
      const p = Math.min(0.95, Math.max(0.05, (i % 10) / 10 + 0.05 + (group === "synthetic-group-b" ? 0.02 : 0)));
      rows.push({ group, predictedProb: p, label: rand() < p });
    }
  }
  return rows;
}
computations.push(
  auditPrediction(
    "synthetic-selftest-calibration-metric",
    "NOT a real computation. Exercises equalized-odds and calibration-by-group math against a synthetic, deterministic numeric fixture (n=60/group) because LEADOS does not score individual people's future performance.",
    deterministicPredictionFixture(),
  ),
);

const report = generateFairnessReport(computations, NOW);
const text = formatReportAsText(report);
console.log(text);

mkdirSync("reports", { recursive: true });
writeFileSync("reports/fairness-report.txt", text, "utf-8");
writeFileSync("reports/fairness-report.json", JSON.stringify(report, null, 2), "utf-8");

// --- k-anonymity suppression demonstration (cohort-micro, n=4) -------------
const microPersonIds = org.cohorts.filter((c) => c.cohort === "cohort-micro").map((c) => c.personId);
const microGaps: CompensationGap[] = microPersonIds
  .map((personId) => {
    const comp = compByPerson.get(personId);
    const band = comp ? SEED_BANDS.find((b) => b.id === comp.bandId) : undefined;
    return comp && band ? computeGap(comp, band) : null;
  })
  .filter((g): g is CompensationGap => g !== null);

test("main cohorts each have n >= 30 (required to evaluate gates at all)", () => {
  for (const c of ["cohort-alpha", "cohort-beta", "cohort-gamma", "cohort-delta"]) {
    const n = perPersonRows.filter((r) => r.cohort === c).length;
    assert(n >= 30, `cohort ${c} has n=${n}, expected >= 30`);
  }
});

test("succession-readiness DPD gate is evaluated and passes at the declared 0.1 threshold", () => {
  const c = computations.find((c) => c.name === "succession-readiness-ready-now")!;
  assertEqual(c.dpdGate.verdict, "pass", `succession readiness DPD gate verdict, observed=${c.dpdGate.observed}`);
});

test("role-fit DPD gate is evaluated and passes at the declared 0.1 threshold", () => {
  const c = computations.find((c) => c.name === "role-fit-shortlist-threshold")!;
  assertEqual(c.dpdGate.verdict, "pass", `role-fit DPD gate verdict, observed=${c.dpdGate.observed}`);
});

test("compensation-underpaid DPD gate is evaluated and passes at the declared 0.1 threshold", () => {
  const c = computations.find((c) => c.name === "compensation-underpaid-vs-band-mid")!;
  assertEqual(c.dpdGate.verdict, "pass", `compensation DPD gate verdict, observed=${c.dpdGate.observed}`);
});

test("workload-high-load DPD gate is evaluated and passes at the declared 0.1 threshold", () => {
  const c = computations.find((c) => c.name === "workload-high-cognitive-load")!;
  assertEqual(c.dpdGate.verdict, "pass", `workload DPD gate verdict, observed=${c.dpdGate.observed}`);
});

test("known-biased synthetic fixture correctly FAILS its gate (never hidden)", () => {
  const c = computations.find((c) => c.name === "synthetic-selftest-known-biased-fixture")!;
  assertEqual(c.dpdGate.verdict, "fail", "the deliberately biased fixture must be reported as a failing gate, not suppressed");
  assert(report.summary.fail >= 1, "report summary must count the known failure");
});

test("calibration/equalized-odds self-test produced an evaluable result with reported sample sizes", () => {
  const c = computations.find((c) => c.name === "synthetic-selftest-calibration-metric")!;
  assert(c.equalizedOdds !== null && c.equalizedOdds.groups.every((g) => g.n >= 30), "equalized-odds groups must report n >= 30");
  assert(c.calibration !== null, "calibration report must be present");
});

test("k-anonymity suppression: a 4-person aggregate must not render", () => {
  assertEqual(microGaps.length, 4, "test fixture setup: expected exactly 4 people in cohort-micro");
  const agg = bandAggregate(microGaps[0]?.bandId ?? "unknown", microGaps, 5);
  assert(agg.suppressed, "a compensation aggregate over 4 people must be suppressed below k=5");
  assertEqual(agg.meanPositionInBandPct, null, "suppressed aggregate must not leak a number");
  const direct = kAnonymitySuppress(4, 5);
  assert(direct.suppressed, "kAnonymitySuppress(4,5) must suppress");
});

test("k-anonymity: an aggregate at or above k=5 does render", () => {
  const alphaIds = org.cohorts.filter((c) => c.cohort === "cohort-alpha").map((c) => c.personId).slice(0, 10);
  const gaps = alphaIds
    .map((personId) => {
      const comp = compByPerson.get(personId);
      const band = comp ? SEED_BANDS.find((b) => b.id === comp.bandId) : undefined;
      return comp && band ? computeGap(comp, band) : null;
    })
    .filter((g): g is CompensationGap => g !== null);
  assert(gaps.length >= 5, "test fixture setup: need at least 5 people for this check");
  const agg = bandAggregate(gaps[0].bandId, gaps, 5);
  assert(!agg.suppressed, "an aggregate of >= 5 people must not be suppressed");
  assert(typeof agg.meanPositionInBandPct === "number", "a rendered aggregate must include its number");
});

test("every gate result in the report carries an explicit sample size or an insufficient-sample note", () => {
  for (const c of computations) {
    assert(c.sampleSizeTotal >= 0, `computation ${c.name} missing sampleSizeTotal`);
    assert(c.demographicParity.groups.every((g) => typeof g.n === "number"), `computation ${c.name} missing per-group n`);
  }
});

runAll("test:fairness").then((code) => process.exit(code));
