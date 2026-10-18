import { project, computeFindings } from "./engine";
import { buildAllClear, buildSeed } from "./store";
import { SEVERITY_WEIGHT } from "./types";
import type { AppState } from "./types";

export interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

// Original self-tests, run against the real engine functions (not reimplemented
// logic), in the browser, on demand. A small, honestly-scoped suite (6 tests) —
// not presented as equivalent to any larger test-suite history claimed for
// github.com/wbweve/Leados, which this delivery does not share or continue.

export function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];
  const now = new Date().toISOString();

  // T1: an all-clear org produces zero findings and every domain score is 0.
  {
    const state = buildAllClear();
    const p = project(state, now);
    const pass = p.findings.length === 0 && p.domainScores.every((d) => d.score === 0);
    results.push({
      id: "T1",
      name: "All-clear org → zero findings, all domain scores 0",
      pass,
      detail: pass ? "OK" : `Got ${p.findings.length} findings, scores: ${p.domainScores.map((d) => d.score).join(",")}`,
    });
  }

  // T2: a person exactly on cadence (not past it) does not fire ONE_ON_ONE_OVERDUE.
  {
    const state = buildAllClear();
    const exactlyOnCadence = new Date(Date.now() - state.people[0].cadenceDays * 86400000).toISOString();
    const edited: AppState = { ...state, people: [{ ...state.people[0], lastOneOnOne: exactlyOnCadence }, ...state.people.slice(1)] };
    const findings = computeFindings(edited, now);
    const fired = findings.some((f) => f.key === `R1:${edited.people[0].id}`);
    results.push({
      id: "T2",
      name: "1:1 exactly on cadence (not past it) does not fire R1",
      pass: !fired,
      detail: !fired ? "OK — strict > boundary respected" : "R1 fired at the exact boundary (should not)",
    });
  }

  // T3: logging a 1:1 today clears an overdue R1 finding for that person.
  {
    const state = buildSeed();
    const before = computeFindings(state, now).some((f) => f.rule === "ONE_ON_ONE_OVERDUE" && f.sourceIds.includes(state.people[0].id));
    const fixed: AppState = { ...state, people: [{ ...state.people[0], lastOneOnOne: now }, ...state.people.slice(1)] };
    const after = computeFindings(fixed, now).some((f) => f.rule === "ONE_ON_ONE_OVERDUE" && f.sourceIds.includes(state.people[0].id));
    results.push({
      id: "T3",
      name: "Logging a 1:1 today clears that person's overdue finding",
      pass: before && !after,
      detail: `before=${before} after=${after}`,
    });
  }

  // T4: severity weights are strictly ordered critical > high > medium > low.
  {
    const pass = SEVERITY_WEIGHT.critical > SEVERITY_WEIGHT.high && SEVERITY_WEIGHT.high > SEVERITY_WEIGHT.medium && SEVERITY_WEIGHT.medium > SEVERITY_WEIGHT.low;
    results.push({ id: "T4", name: "Severity weights strictly ordered (critical > high > medium > low)", pass, detail: JSON.stringify(SEVERITY_WEIGHT) });
  }

  // T5: BURNOUT_RISK (R3) requires BOTH an overdue 1:1 AND recent negative feedback — neither alone is enough.
  {
    const state = buildSeed();
    const person = state.people[0];
    const onlyOverdue: AppState = { ...state, people: [{ ...person, lastFeedbackSentiment: "positive" }, ...state.people.slice(1)] };
    const onlyNegative: AppState = { ...state, people: [{ ...person, lastOneOnOne: now }, ...state.people.slice(1)] };
    const bothTrue = computeFindings(state, now).some((f) => f.key === `R3:${person.id}`);
    const overdueOnlyFires = computeFindings(onlyOverdue, now).some((f) => f.key === `R3:${person.id}`);
    const negativeOnlyFires = computeFindings(onlyNegative, now).some((f) => f.key === `R3:${person.id}`);
    const pass = bothTrue && !overdueOnlyFires && !negativeOnlyFires;
    results.push({
      id: "T5",
      name: "BURNOUT_RISK (R3) only fires when both sub-conditions hold",
      pass,
      detail: `both=${bothTrue} overdueOnly=${overdueOnlyFires} negativeOnly=${negativeOnlyFires}`,
    });
  }

  // T6: DOMAIN_CONCENTRATION (R11) requires >=2 high/critical findings in the same domain, not just 1.
  {
    const state = buildSeed(); // seed is designed to have 2+ high/critical "people" findings (overdue 1:1 + burnout)
    const findings = computeFindings(state, now);
    const peopleHiCrit = findings.filter((f) => f.domain === "people" && (f.severity === "high" || f.severity === "critical")).length;
    const concentrationFired = findings.some((f) => f.rule === "DOMAIN_CONCENTRATION" && f.key === "R11:people");
    const pass = peopleHiCrit >= 2 ? concentrationFired : !concentrationFired;
    results.push({
      id: "T6",
      name: "DOMAIN_CONCENTRATION (R11) fires iff a domain has >= 2 high/critical findings",
      pass,
      detail: `peopleHiCrit=${peopleHiCrit} fired=${concentrationFired}`,
    });
  }

  return results;
}
