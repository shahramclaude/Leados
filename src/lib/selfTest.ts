// Original runtime self-test suite for this workspace's own code (not a
// reproduction of any external T_L_*/G_L_* test suite — no such suite was
// verified to exist anywhere this session had access to).

import { RULES, CATEGORIES } from "./rules";
import { runInference } from "./inference";
import { defaultState } from "./store";
import { computeWeights, calibratedSeverity } from "./calibrateRules";
import { traverse } from "./decisionTrees";
import { exportMarkdown } from "./docs";
import { findSimilarIncidents, recordIncident } from "./institutionalMemory";
import { evaluateCycle } from "./selfImprove";
import { isOnboardingValid } from "./onboarding";

export interface SelfTestResult {
  id: string;
  pass: boolean;
  detail: string;
}

export function runSelfTests(): SelfTestResult[] {
  const results: SelfTestResult[] = [];

  results.push({
    id: "RULES-001 catalog size is 144",
    pass: RULES.length === 144,
    detail: `RULES.length = ${RULES.length}`,
  });

  results.push({
    id: "RULES-002 exactly 8 categories, 18 rules each",
    pass:
      CATEGORIES.length === 8 &&
      CATEGORIES.every((c) => RULES.filter((r) => r.category === c).length === 18),
    detail: CATEGORIES.map((c) => `${c}: ${RULES.filter((r) => r.category === c).length}`).join(" | "),
  });

  results.push({
    id: "RULES-003 no duplicate rule IDs",
    pass: new Set(RULES.map((r) => r.id)).size === RULES.length,
    detail: `unique ids = ${new Set(RULES.map((r) => r.id)).size}`,
  });

  const state = defaultState();
  const toggled = { ...state.signalBoard };
  toggled["R1"] = { ...toggled["R1"], active: true, severity: "high", recurrence: 1 };
  const findings = runInference(toggled);
  results.push({
    id: "INFER-001 one active rule produces one finding",
    pass: findings.length === 1 && findings[0].category === "Workload & Burnout",
    detail: `findings=${findings.length}`,
  });

  const weights = computeWeights([
    { ruleId: "R1", outcome: "confirmed", at: 1 },
    { ruleId: "R1", outcome: "confirmed", at: 2 },
    { ruleId: "R1", outcome: "confirmed", at: 3 },
    { ruleId: "R1", outcome: "confirmed", at: 4 },
  ]);
  results.push({
    id: "CALIBRATE-001 repeated confirm raises weight above 0.85",
    pass: (weights["R1"] ?? 0) > 0.85,
    detail: `weight=${(weights["R1"] ?? 0).toFixed(3)}`,
  });
  const rule = RULES.find((r) => r.id === "R1")!;
  results.push({
    id: "CALIBRATE-002 high weight escalates medium->high",
    pass: calibratedSeverity(rule, "medium", weights) === "high",
    detail: `result=${calibratedSeverity(rule, "medium", weights)}`,
  });

  const leaf = traverse("Workload & Burnout", [true, true]);
  results.push({
    id: "TREE-001 Workload tree reaches a leaf in 2 answers",
    pass: leaf.length > 0 && !leaf.startsWith("No recommendation"),
    detail: leaf,
  });

  const md = exportMarkdown(state, findings);
  results.push({
    id: "DOCS-001 markdown export contains header and finding count",
    pass: md.includes("# Leados session export") && md.includes("Active findings"),
    detail: `length=${md.length}`,
  });

  const incident = recordIncident(findings[0], "test incident");
  const similar = findSimilarIncidents([incident], findings[0]);
  results.push({
    id: "MEMORY-001 identical finding matches itself",
    pass: similar.length === 1,
    detail: `matches=${similar.length}`,
  });

  const report = evaluateCycle(
    [
      { ruleId: "R2", outcome: "false_positive", at: 1 },
      { ruleId: "R2", outcome: "false_positive", at: 2 },
    ],
    [],
  );
  results.push({
    id: "IMPROVE-001 repeated false positives trigger a suggestion",
    pass: report.suggestions.some((s) => s.ruleId === "R2"),
    detail: `suggestions=${report.suggestions.length}`,
  });

  results.push({
    id: "ONBOARD-001 default baseline validates",
    pass: isOnboardingValid(defaultState().onboarding.baseline),
    detail: JSON.stringify(defaultState().onboarding.baseline),
  });

  return results;
}
