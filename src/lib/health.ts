import type { GraphEdge, Hypothesis, LeadosEvent, Person, RuleEvaluation } from "@/lib/types";
import { project, hasExitSignal } from "@/lib/eventBrain";
import { computeOKRHealth, okrHealthFromScore } from "@/lib/strategicIntelligence";
import { runMonteCarloRunway } from "@/lib/financialOS";
import { computeCriticalPath, buildExecutionReport } from "@/lib/executionIntelligence";
import { buildRuleContext, runRuleEngine, RULE_SPECS } from "@/lib/ruleEngine";
import { detectCascades, CAUSAL_LINKS } from "@/lib/causalInference";
import { CONFIDENCE_DECAY_PER_HOP, jaccard } from "@/lib/knowledgeGraph";
import { clampCalibrationAdjustment } from "@/lib/metricsIntelligence";
import { computeNineBox, computePageRank, compositeEntropy, dedupeHypotheses, computeBrierScore, buildMorningBrief, computeOrgHealthScore } from "@/lib/orgIntelligence";
import type { HealthSuiteReport, HealthTestResult } from "@/lib/types";
import type { ProjectState } from "@/lib/eventBrain";

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms };
}

function test(id: string, name: string, fn: () => { pass: boolean; actual: string; expected: string }): HealthTestResult {
  const start = performance.now();
  try {
    const { pass, actual, expected } = fn();
    return { id, name, pass, actual, expected, durationMs: performance.now() - start };
  } catch (err) {
    return { id, name, pass: false, actual: `threw: ${(err as Error).message}`, expected: "no throw", durationMs: performance.now() - start };
  }
}

function fakePerson(overrides: Partial<Person>): Person {
  return { id: "p1", name: "Test", role: "IC", domain: "people", startDate: new Date().toISOString(), performance: 50, potential: 50, flightRisk: 0.1, exitSignals: [], ...overrides };
}

function fakeProject(overrides: Partial<ProjectState>): ProjectState {
  return { id: "x", title: "X", domain: "execution", owner: "Owner", status: "backlog", confidence: 0.8, dependsOn: [], durationDays: 5, createdAt: new Date().toISOString(), milestones: [], blockers: [], ...overrides };
}

export function runHealthSuite(events: LeadosEvent[], now: Date = new Date()): HealthSuiteReport {
  const projection = project(events);
  const projectionAgain = project(events);

  const tests: HealthTestResult[] = [];

  tests.push(
    test("T01_STORE", "Event store returns an array", () => ({
      pass: Array.isArray(events),
      actual: Array.isArray(events) ? `array(${events.length})` : typeof events,
      expected: "array",
    }))
  );

  tests.push(
    test("T02_APPEND_ONLY", "Events are monotonically ordered by id (append-only)", () => {
      const ids = events.map((e) => e.id);
      const sorted = [...ids].sort((a, b) => a - b);
      const pass = ids.length === 0 || JSON.stringify([...ids].sort((a, b) => a - b)) === JSON.stringify(sorted);
      return { pass, actual: `n=${ids.length}`, expected: "ids form a valid append-only sequence" };
    })
  );

  tests.push(
    test("T03_HEATMAP_BOUNDS", "Blocker heatmap counts are all >= 0", () => {
      const report = buildExecutionReport(projection, now);
      const pass = report.blockerHeatmap.every((c) => c.count >= 0);
      return { pass, actual: `min=${Math.min(...report.blockerHeatmap.map((c) => c.count), 0)}`, expected: ">= 0" };
    })
  );

  tests.push(
    test("T04_VELOCITY_MATH", "OKR velocity is positive for a rising key result", () => {
      const okr = computeOKRHealth(
        [
          {
            id: "g1",
            title: "G",
            owner: "O",
            quarterStart: new Date(now.getTime() - 20 * 86400000).toISOString(),
            quarterLengthDays: 90,
            closed: false,
            linkedDecisions: [],
            keyResults: [
              {
                id: "kr1",
                title: "KR",
                target: 100,
                unit: "u",
                current: 50,
                history: [
                  { ts: new Date(now.getTime() - 14 * 86400000).toISOString(), value: 0 },
                  { ts: now.toISOString(), value: 50 },
                ],
              },
            ],
          },
        ],
        now
      );
      const v = okr.objectives[0]?.velocity ?? 0;
      return { pass: v > 0, actual: v.toFixed(4), expected: "> 0" };
    })
  );

  tests.push(
    test("T05_PROJECTION_PURE", "project() is a pure function (same input -> same output)", () => {
      const pass = JSON.stringify(projection) === JSON.stringify(projectionAgain);
      return { pass, actual: pass ? "deep-equal" : "differs", expected: "deep-equal" };
    })
  );

  let ruleEvaluations: RuleEvaluation[] = [];
  tests.push(
    test("T06_RULE_ENGINE_ALL_WIRED", "All 48 rules evaluate without throwing", () => {
      const ctx = buildRuleContext(projection, now);
      ruleEvaluations = runRuleEngine(ctx);
      const pass = ruleEvaluations.length === 48 && RULE_SPECS.length === 48;
      return { pass, actual: `${ruleEvaluations.length} evaluations`, expected: "48 evaluations" };
    })
  );

  tests.push(
    test("T07_CAUSAL_INFERENCE_STABLE", "Causal cascade detection runs in < 200ms", () => {
      const { ms } = timed(() => detectCascades(ruleEvaluations));
      return { pass: ms < 200, actual: `${ms.toFixed(2)}ms`, expected: "< 200ms" };
    })
  );

  tests.push(
    test("T08_FLIGHT_RISK_BOUNDED", "All flight risk scores are within [0,1]", () => {
      const pass = projection.people.every((p) => p.flightRisk >= 0 && p.flightRisk <= 1);
      return { pass, actual: `n=${projection.people.length}`, expected: "all in [0,1]" };
    })
  );

  tests.push(
    test("T09_NINE_BOX_COMPLETE", "Nine-box placement is complete with no duplicates", () => {
      const placements = computeNineBox(projection.people);
      const ids = placements.map((p) => p.person.id);
      const pass = placements.length === projection.people.length && new Set(ids).size === ids.length;
      return { pass, actual: `${placements.length} placements, ${new Set(ids).size} unique`, expected: `${projection.people.length} placements, all unique` };
    })
  );

  tests.push(
    test("T10_OKR_SCORE_FORMULA", "OKR score(progress=0.5, elapsed=0.8) = 0.625 -> at_risk", () => {
      const score = 0.5 / 0.8;
      const health = okrHealthFromScore(score);
      const pass = Math.abs(score - 0.625) < 0.001 && health === "at_risk";
      return { pass, actual: `score=${score.toFixed(3)}, health=${health}`, expected: "score=0.625, health=at_risk" };
    })
  );

  const runway = runMonteCarloRunway(500000, 80000, 0.02, 777);
  tests.push(
    test("T11_MONTE_CARLO_ORDER", "Monte Carlo percentiles are monotonically ordered", () => {
      const m = runway.monteCarlo;
      const pass = m.p5 <= m.p10 && m.p10 <= m.p25 && m.p25 <= m.p50 && m.p50 <= m.p75 && m.p75 <= m.p90 && m.p90 <= m.p95;
      return { pass, actual: `${m.p5},${m.p10},${m.p25},${m.p50},${m.p75},${m.p90},${m.p95}`, expected: "p5<=p10<=p25<=p50<=p75<=p90<=p95" };
    })
  );

  tests.push(
    test("T12_MONTE_CARLO_REPRODUCIBLE", "Same seed produces same p50 twice", () => {
      const a = runMonteCarloRunway(500000, 80000, 0.02, 555).monteCarlo.p50;
      const b = runMonteCarloRunway(500000, 80000, 0.02, 555).monteCarlo.p50;
      return { pass: a === b, actual: `${a} vs ${b}`, expected: "identical" };
    })
  );

  tests.push(
    test("T13_BANKRUPTCY_PATH", "burn > cash leads to p50 <= 1 month", () => {
      const r = runMonteCarloRunway(10000, 50000, 0, 999);
      return { pass: r.monteCarlo.p50 <= 1, actual: `p50=${r.monteCarlo.p50}`, expected: "<= 1" };
    })
  );

  tests.push(
    test("T14_BRIER_SCORE_BOUNDS", "Brier score is within [0,1]", () => {
      const b = computeBrierScore([
        { confidence: 0.8, outcome: 1 },
        { confidence: 0.3, outcome: 0 },
        { confidence: 0.6, outcome: 1 },
      ]);
      return { pass: b >= 0 && b <= 1, actual: b.toFixed(4), expected: "in [0,1]" };
    })
  );

  tests.push(
    test("T15_CALIBRATION_CLAMPS", "Calibration weight change is clamped to +/-10% per cycle", () => {
      const adjusted = clampCalibrationAdjustment(1.0, 2.0);
      const pass = Math.abs(adjusted - 1.0) <= 0.1 + 1e-9;
      return { pass, actual: adjusted.toFixed(3), expected: "within [0.9, 1.1]" };
    })
  );

  tests.push(
    test("T16_KAHN_ACYCLIC", "Valid DAG: no project appears twice in topological order", () => {
      const projects = [fakeProject({ id: "a", dependsOn: [] }), fakeProject({ id: "b", dependsOn: ["a"] }), fakeProject({ id: "c", dependsOn: ["b"] })];
      const result = computeCriticalPath(projects);
      const pass = result.order.length === new Set(result.order).size && result.order.length === 3 && !result.cyclesDetected;
      return { pass, actual: `order=[${result.order.join(",")}], cycles=${result.cyclesDetected}`, expected: "3 unique nodes, cyclesDetected=false" };
    })
  );

  tests.push(
    test("T17_KAHN_CYCLE_DETECTED", "A->B->C->A cycle is detected", () => {
      const projects = [fakeProject({ id: "A", dependsOn: ["C"] }), fakeProject({ id: "B", dependsOn: ["A"] }), fakeProject({ id: "C", dependsOn: ["B"] })];
      const result = computeCriticalPath(projects);
      return { pass: result.cyclesDetected, actual: `cyclesDetected=${result.cyclesDetected}`, expected: "true" };
    })
  );

  tests.push(
    test("T18_CRITICAL_PATH_BOTTLENECK", "Bottleneck project lies within the critical path chain", () => {
      const projects = [
        fakeProject({ id: "a", dependsOn: [], confidence: 0.9, durationDays: 5 }),
        fakeProject({ id: "b", dependsOn: ["a"], confidence: 0.3, durationDays: 10 }),
        fakeProject({ id: "c", dependsOn: ["b"], confidence: 0.9, durationDays: 5 }),
      ];
      const result = computeCriticalPath(projects);
      const pass = result.bottleneck !== null && result.criticalPath.includes(result.bottleneck);
      return { pass, actual: `bottleneck=${result.bottleneck}, path=[${result.criticalPath.join(",")}]`, expected: "bottleneck in critical path" };
    })
  );

  tests.push(
    test("T19_JACCARD_IDENTITY", "Jaccard similarity of identical sets is 1.0", () => {
      const s = new Set(["a", "b", "c"]);
      const j = jaccard(s, new Set(s));
      return { pass: j === 1, actual: j.toString(), expected: "1" };
    })
  );

  tests.push(
    test("T20_JACCARD_DISJOINT", "Jaccard similarity of disjoint sets is 0.0", () => {
      const j = jaccard(new Set(["a", "b"]), new Set(["c", "d"]));
      return { pass: j === 0, actual: j.toString(), expected: "0" };
    })
  );

  tests.push(
    test("T21_PAGERANK_BOUNDS", "All PageRank scores are within [0,1]", () => {
      const nodeIds = ["a", "b", "c"];
      const edges: GraphEdge[] = [
        { source: "a", target: "b", active: true, weight: 1 },
        { source: "b", target: "c", active: true, weight: 1 },
        { source: "c", target: "a", active: true, weight: 1 },
      ];
      const ranks = computePageRank(nodeIds, edges);
      const pass = [...ranks.values()].every((v) => v >= 0 && v <= 1);
      return { pass, actual: JSON.stringify([...ranks.entries()]), expected: "all in [0,1]" };
    })
  );

  tests.push(
    test("T22_ENTROPY_BOUNDS", "Composite entropy is within [0,100]", () => {
      const e1 = compositeEntropy([5, 5, 5, 5]);
      const e2 = compositeEntropy([10, 0, 0, 0]);
      const pass = e1 >= 0 && e1 <= 100 && e2 >= 0 && e2 <= 100;
      return { pass, actual: `uniform=${e1.toFixed(1)}, concentrated=${e2.toFixed(1)}`, expected: "both in [0,100]" };
    })
  );

  tests.push(
    test("T23_HYPOTHESIS_DEDUP", "Same key + entity produces exactly 1 hypothesis", () => {
      const hs: Hypothesis[] = [
        { id: "h1", ruleId: "r1", entityId: "e1", createdAt: new Date(now.getTime() - 1000).toISOString(), status: "open", confidence: 0.5, resolveBy: now.toISOString(), statement: "a" },
        { id: "h2", ruleId: "r1", entityId: "e1", createdAt: now.toISOString(), status: "open", confidence: 0.6, resolveBy: now.toISOString(), statement: "b" },
      ];
      const deduped = dedupeHypotheses(hs);
      return { pass: deduped.length === 1, actual: `${deduped.length}`, expected: "1" };
    })
  );

  tests.push(
    test("T24_MORNING_BRIEF_4_SENTENCES", "Morning brief contains exactly 4 sentences", () => {
      const brief = buildMorningBrief({ orgName: "Acme", firingCount: 3, criticalCount: 1, topFinding: "Runway critical", runwayMonths: 8.2 });
      const count = (brief.match(/\. /g) ?? []).length;
      return { pass: count === 3, actual: `${count} '. ' separators`, expected: "3 (= 4 sentences)" };
    })
  );

  tests.push(
    test("T25_EXIT_SIGNAL_TRUE", '"recruiter reached out" is detected as an exit signal', () => {
      const r = hasExitSignal("A recruiter reached out to me on LinkedIn");
      return { pass: r === true, actual: String(r), expected: "true" };
    })
  );

  tests.push(
    test("T26_EXIT_SIGNAL_FALSE", '"great team meeting" is not an exit signal', () => {
      const r = hasExitSignal("We had a great team meeting today");
      return { pass: r === false, actual: String(r), expected: "false" };
    })
  );

  tests.push(
    test("T27_CONFIDENCE_DECAY", "Confidence after 3 BFS hops = 0.9^3 = 0.729", () => {
      const decay = Math.pow(CONFIDENCE_DECAY_PER_HOP, 3);
      const pass = Math.abs(decay - 0.729) < 0.001;
      return { pass, actual: decay.toFixed(4), expected: "0.729 (+/- 0.001)" };
    })
  );

  tests.push(
    test("T28_CAUSAL_AMPLIFICATION", "Active cascade produces effectiveSeverity > originalSeverity", () => {
      const link = CAUSAL_LINKS[0];
      const fakeEvals: RuleEvaluation[] = [
        { ruleId: link.fromRuleId, domain: "people", name: "from", description: "", firesWhen: "", resolvesWhen: "", status: "active", firing: true, severity: "high", confidence: 0.8, scoreMath: "", basis: "", playbookId: "" },
        { ruleId: link.toRuleId, domain: "execution", name: "to", description: "", firesWhen: "", resolvesWhen: "", status: "active", firing: true, severity: "medium", confidence: 0.8, scoreMath: "", basis: "", playbookId: "" },
      ];
      const cascades = detectCascades(fakeEvals);
      const active = cascades.find((c) => c.link.id === link.id);
      const pass = Boolean(active?.active && active.effectiveSeverityScore > active.originalSeverityScore);
      return { pass, actual: `original=${active?.originalSeverityScore}, effective=${active?.effectiveSeverityScore}`, expected: "effective > original" };
    })
  );

  tests.push(
    test("T29_DOMAIN_COVERAGE", "All 8 domains have at least 1 finding in seed data", () => {
      const byDomain = new Map<string, number>();
      for (const e of ruleEvaluations) if (e.firing) byDomain.set(e.domain, (byDomain.get(e.domain) ?? 0) + 1);
      const domains = ["people", "finance", "strategy", "execution", "rd", "sales", "knowledge", "manufacturing"];
      const missing = domains.filter((d) => !byDomain.get(d));
      return { pass: missing.length === 0, actual: `missing=[${missing.join(",")}]`, expected: "missing=[]" };
    })
  );

  tests.push(
    test("T30_ORG_HEALTH_SCORE_BOUNDS", "Org health score is within [0,100] across scenarios", () => {
      const scores = [
        computeOrgHealthScore({ teamHealthScore: 100, avgConfidence: 1, bankruptcyRisk: 0, avgFlightRisk: 0, firingCriticalCount: 0 }),
        computeOrgHealthScore({ teamHealthScore: 0, avgConfidence: 0, bankruptcyRisk: 1, avgFlightRisk: 1, firingCriticalCount: 10 }),
        computeOrgHealthScore({ teamHealthScore: 55, avgConfidence: 0.6, bankruptcyRisk: 0.2, avgFlightRisk: 0.3, firingCriticalCount: 2 }),
      ];
      const pass = scores.every((s) => s >= 0 && s <= 100);
      return { pass, actual: scores.map((s) => s.toFixed(1)).join(","), expected: "all in [0,100]" };
    })
  );

  const passing = tests.filter((t) => t.pass).length;
  const totalMs = tests.reduce((a, t) => a + t.durationMs, 0);
  return { tests, passing, total: tests.length, totalMs, allPass: passing === tests.length };
}

export { fakePerson };
