"use client";

import { useState } from "react";
import type { IntelligenceData } from "@/lib/intelligence";

interface TestResult {
  id: string;
  label: string;
  pass: boolean;
}

const VALID_MODES = ["REACTIVE", "BALANCED", "STRATEGIC_DRIFT", "STRUCTURAL_STRESS"];

function runTests(data: IntelligenceData): TestResult[] {
  const results: TestResult[] = [];

  const sevSorted = data.findings.every((f, i, arr) => i === 0 || arr[i - 1].sev >= f.sev);
  results.push({ id: "HW-01", label: "findings array sorted by sev descending", pass: sevSorted });

  results.push({
    id: "HW-02",
    label: "all finding severities in [1,5]",
    pass: data.findings.every((f) => f.sev >= 1 && f.sev <= 5),
  });

  results.push({
    id: "HW-03",
    label: "all domain scores in [0,100]",
    pass: data.domainScores.every((d) => d.score >= 0 && d.score <= 100),
  });

  results.push({
    id: "HW-04",
    label: "healthScore.overall in [0,100]",
    pass: data.healthScore.overall >= 0 && data.healthScore.overall <= 100,
  });

  results.push({
    id: "HW-05",
    label: "beliefs has exactly 3 keys",
    pass: Object.keys(data.beliefs).length === 3,
  });

  results.push({
    id: "HW-06",
    label: "simulation has STATUS_QUO scenario",
    pass: !!data.simulation.scenarios.STATUS_QUO,
  });

  results.push({
    id: "HW-07",
    label: "attentionPlan totalHours ≤ 30",
    pass: data.attentionPlan.totalHours <= 30,
  });

  results.push({
    id: "HW-08",
    label: "temporalMode is one of 4 valid values",
    pass: VALID_MODES.includes(data.temporalMode),
  });

  results.push({
    id: "HW-09",
    label: "orgEntropy in [0,1]",
    pass: data.orgEntropy >= 0 && data.orgEntropy <= 1,
  });

  results.push({
    id: "HW-10",
    label: "highestLeverageAction has action + urgency",
    pass: data.highestLeverageAction === null || (!!data.highestLeverageAction.action && !!data.highestLeverageAction.urgency),
  });

  const flightSorted = data.flightRisk.every((f, i, arr) => i === 0 || arr[i - 1].riskScore >= f.riskScore);
  results.push({ id: "HW-11", label: "flightRisk sorted by riskScore desc", pass: flightSorted });

  results.push({ id: "HW-12", label: "correlations is array", pass: Array.isArray(data.correlations) });

  results.push({
    id: "HW-13",
    label: "inferences each has confidence in [0,100]",
    pass: data.inferences.every((i) => i.confidence >= 0 && i.confidence <= 100),
  });

  results.push({
    id: "HW-14",
    label: "feedbackLoops has at least 1 item",
    pass: data.feedbackLoops.length >= 1,
  });

  results.push({
    id: "HW-15",
    label: "generatedAt is valid ISO timestamp",
    pass: !Number.isNaN(new Date(data.generatedAt).getTime()),
  });

  return results;
}

export function HealthView({ data }: { data: IntelligenceData }) {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  function run() {
    const start = performance.now();
    const r = runTests(data);
    const end = performance.now();
    setResults(r);
    setDuration(Math.round(end - start));
  }

  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Health Wall</h2>
        <button onClick={run} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500">
          Run health wall
        </button>
      </div>

      {results && (
        <>
          <div
            className={`rounded-xl border p-4 text-lg font-semibold ${
              passCount === results.length ? "border-green-700 bg-green-950/20 text-green-400" : "border-red-700 bg-red-950/20 text-red-400"
            }`}
          >
            {passCount === results.length ? `ALL CLEAR (${passCount}/${results.length})` : `FAILURES DETECTED (${passCount}/${results.length})`}
            <span className="ml-3 text-xs font-normal text-slate-500">{duration}ms</span>
          </div>

          <div className="space-y-1.5">
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">{r.id}</span>
                  <span className="text-slate-300">{r.label}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${r.pass ? "bg-green-600/20 text-green-400" : "bg-red-600/20 text-red-400"}`}>
                  {r.pass ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!results && <div className="text-slate-500">Run the health wall to validate the intelligence data contract.</div>}
    </div>
  );
}
