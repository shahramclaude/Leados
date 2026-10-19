// Client-safe self-test suite. Every import below is a pure module with no
// @/db or "pg" dependency, so runSelfTests() can execute entirely in the
// browser (src/views/AboutView.tsx calls it on a button click).

import { DOMAINS } from "./types";
import { runFullOrchestration } from "./orchestrator";
import type { OrchestrationDataset } from "./dataset";
import { runMonteCarloRunway } from "./monteCarlo";
import { computeFlightRiskScores } from "./flightRisk";
import { computeCriticalPath, detectCycle, type ProjectNode } from "./criticalPath";
import { calibrateRuleWeight } from "./ruleCalibration";
import { generateFlightRiskHypothesis, type HypothesisCandidate } from "./hypotheses";
import { computeOkrScore, computeOkrStatus } from "./okr";
import { computeOneOnOneQuality } from "./oneOnOne";
import { computeDeliveryConfidence } from "./delivery";

export interface SelfTestCase {
  name: string;
  passed: boolean;
  actual: unknown;
  expected: unknown;
}

export interface SelfTestResult {
  passed: number;
  failed: number;
  tests: SelfTestCase[];
}

function test(name: string, actual: unknown, expected: unknown, passed: boolean): SelfTestCase {
  return { name, actual, expected, passed };
}

/** Minimal mock dataset: 5 people, 10 events — stands in for a "mock DB". */
function buildMockDataset(): OrchestrationDataset {
  const now = new Date("2026-01-15T00:00:00.000Z");
  const people = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Person ${i + 1}`,
    role: "Engineer",
    team: "Platform",
  }));
  const eventTypes = ["negative_sentiment", "positive_sentiment", "missed_one_on_one"];
  const events = Array.from({ length: 10 }, (_, i) => ({
    id: `e${i + 1}`,
    personId: people[i % people.length].id,
    type: eventTypes[i % eventTypes.length],
    weight: 1,
    createdAt: now.toISOString(),
  }));

  return {
    now,
    people,
    events,
    oneOnOnes: [],
    decisions: [],
    scenarios: [],
    projects: [],
    milestones: [],
    blockers: [],
    hypotheses: [],
    okrs: [],
    notifications: [],
    finance: { startingCash: 1_000_000, monthlyBurn: 100_000, burnStdDev: 20_000, monthlyRevenue: 50_000, revenueGrowthRate: 0.05 },
  };
}

function testOrchestratorReturnsAllDomains(): SelfTestCase {
  const dataset = buildMockDataset();
  const result = runFullOrchestration(dataset);
  const presentDomains = DOMAINS.filter((d) => Boolean(result.domainHealth[d]));
  const passed = presentDomains.length === DOMAINS.length;
  return test("ORCHESTRATOR_RETURNS_ALL_DOMAINS", presentDomains, [...DOMAINS], passed);
}

function testMonteCarloOrdering(): SelfTestCase {
  const { p10, p50, p90 } = runMonteCarloRunway(1_000_000, 100_000, 20_000, 50_000, 0.05, 1000);
  const passed = p10 < p50 && p50 < p90;
  return test("MONTE_CARLO_P50_BETWEEN_P10_AND_P90", { p10, p50, p90 }, "p10 < p50 < p90", passed);
}

function testFlightRiskBounded(): SelfTestCase {
  const scores = computeFlightRiskScores([
    { personId: "p1", type: "negative_sentiment", weight: 5, createdAt: "2026-01-01" },
    { personId: "p1", type: "compensation_flag", weight: 3, createdAt: "2026-01-02" },
    { personId: "p2", type: "promotion", weight: 10, createdAt: "2026-01-03" },
    { personId: "p3", type: "missed_one_on_one", weight: 1, createdAt: "2026-01-04" },
  ]);
  const passed = scores.length > 0 && scores.every((s) => s.score >= 0 && s.score <= 1);
  return test("FLIGHT_RISK_SCORE_BOUNDED", scores, "every score within [0, 1]", passed);
}

function testCriticalPathAcyclic(): SelfTestCase {
  const nodes: ProjectNode[] = [
    { id: "A", durationDays: 3, dependsOn: [] },
    { id: "B", durationDays: 5, dependsOn: ["A"] },
    { id: "C", durationDays: 2, dependsOn: ["A"] },
    { id: "D", durationDays: 4, dependsOn: ["B", "C"] },
  ];
  const path = computeCriticalPath(nodes);
  const unique = new Set(path);
  const passed = path.length > 0 && unique.size === path.length;
  return test("CRITICAL_PATH_ACYCLIC", path, "no duplicate project ids", passed);
}

function testCycleDetectionFindsCycle(): SelfTestCase {
  const nodes: ProjectNode[] = [
    { id: "A", durationDays: 1, dependsOn: ["B"] },
    { id: "B", durationDays: 1, dependsOn: ["C"] },
    { id: "C", durationDays: 1, dependsOn: ["A"] },
  ];
  const { hasCycle } = detectCycle(nodes);
  return test("CYCLE_DETECTION_FINDS_CYCLE", hasCycle, true, hasCycle === true);
}

function testRuleCalibrationClampsWeight(): SelfTestCase {
  const low = calibrateRuleWeight(1, 1); // worst possible Brier score
  const high = calibrateRuleWeight(1, 0); // perfect Brier score
  const passed = low >= 0.1 && low <= 3.0 && high >= 0.1 && high <= 3.0;
  return test("RULE_CALIBRATION_CLAMPS_WEIGHT", { brier0: high, brier1: low }, "both within [0.1, 3.0]", passed);
}

function testHypothesisDeduplication(): SelfTestCase {
  const inserted: HypothesisCandidate[] = [];
  const first = generateFlightRiskHypothesis("p1", "Person One", 0.9, inserted);
  if (first) inserted.push(first);
  const second = generateFlightRiskHypothesis("p1", "Person One", 0.9, inserted);
  if (second) inserted.push(second);
  const passed = inserted.length === 1;
  return test("HYPOTHESIS_DEDUPLICATION", inserted.length, 1, passed);
}

function testOkrScoreAtRiskBoundary(): SelfTestCase {
  const score = computeOkrScore(0.5, 0.8);
  const status = computeOkrStatus(score);
  const passed = Math.abs(score - 0.625) < 1e-9 && status === "at_risk";
  return test("OKR_SCORE_AT_RISK_BOUNDARY", { score, status }, { score: 0.625, status: "at_risk" }, passed);
}

function testOneOnOneQualityFloor(): SelfTestCase {
  const score = computeOneOnOneQuality({ daysSinceLast: 30, actionItemsTotal: 0, actionItemsCompleted: 0 });
  return test("1ON1_QUALITY_SCORE_FLOOR", score, 0, score === 0);
}

function testDeliveryConfidenceClamps(): SelfTestCase {
  const score = computeDeliveryConfidence({ overdueMilestones: 5, criticalBlockers: 3 });
  return test("DELIVERY_CONFIDENCE_CLAMPS", score, ">= 0", score >= 0);
}

export function runSelfTests(): SelfTestResult {
  const tests: SelfTestCase[] = [
    testOrchestratorReturnsAllDomains(),
    testMonteCarloOrdering(),
    testFlightRiskBounded(),
    testCriticalPathAcyclic(),
    testCycleDetectionFindsCycle(),
    testRuleCalibrationClampsWeight(),
    testHypothesisDeduplication(),
    testOkrScoreAtRiskBoundary(),
    testOneOnOneQualityFloor(),
    testDeliveryConfidenceClamps(),
  ];
  return {
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    tests,
  };
}
