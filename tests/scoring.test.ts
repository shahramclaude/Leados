import assert from "node:assert/strict";
import { test } from "node:test";
import { bandForScore, evaluateRule, scoreLead, type ScoringRule } from "../src/lib/scoring";

const rules: ScoringRule[] = [
  { name: "Large company", field: "employeeCount", operator: "gte", value: "200", weight: 35 },
  { name: "Budget confirmed", field: "budgetConfirmed", operator: "truthy", value: "true", weight: 30 },
  { name: "High engagement", field: "engagementScore", operator: "gte", value: "7", weight: 25 },
  { name: "Inbound source", field: "source", operator: "eq", value: "inbound", weight: 10 },
];

test("scoreLead sums weights of matched rules only", () => {
  const result = scoreLead(
    { employeeCount: 450, budgetConfirmed: true, engagementScore: 8, source: "inbound" },
    rules,
  );
  assert.equal(result.score, 100);
  assert.equal(result.band, "hot");
  assert.equal(result.breakdown.length, 4);
  assert.ok(result.breakdown.every((entry) => entry.matched));
});

test("scoreLead excludes unmatched rules from the score", () => {
  const result = scoreLead(
    { employeeCount: 40, budgetConfirmed: false, engagementScore: 3, source: "outbound" },
    rules,
  );
  assert.equal(result.score, 0);
  assert.equal(result.band, "cold");
  assert.ok(result.breakdown.every((entry) => !entry.matched));
});

test("scoreLead bands a partial match as warm", () => {
  const result = scoreLead(
    { employeeCount: 220, budgetConfirmed: true, engagementScore: 5, source: "outbound" },
    rules,
  );
  // 35 (large company) + 30 (budget confirmed) = 65 -> warm, not hot
  assert.equal(result.score, 65);
  assert.equal(result.band, "warm");
});

test("bandForScore thresholds", () => {
  assert.equal(bandForScore(70), "hot");
  assert.equal(bandForScore(69), "warm");
  assert.equal(bandForScore(40), "warm");
  assert.equal(bandForScore(39), "cold");
  assert.equal(bandForScore(0), "cold");
});

test("evaluateRule gte/lte/eq/truthy operators", () => {
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "gte", value: "10", weight: 1 }, { x: 10 }), true);
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "gte", value: "10", weight: 1 }, { x: 9 }), false);
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "lte", value: "10", weight: 1 }, { x: 10 }), true);
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "lte", value: "10", weight: 1 }, { x: 11 }), false);
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "eq", value: "foo", weight: 1 }, { x: "foo" }), true);
  assert.equal(evaluateRule({ name: "a", field: "x", operator: "truthy", value: "true", weight: 1 }, { x: false }), false);
});

test("scoreLead clamps score to [0, 100]", () => {
  const heavyRules: ScoringRule[] = [
    { name: "a", field: "x", operator: "truthy", value: "true", weight: 80 },
    { name: "b", field: "y", operator: "truthy", value: "true", weight: 80 },
  ];
  const result = scoreLead({ x: true, y: true }, heavyRules);
  assert.equal(result.score, 100);
});
