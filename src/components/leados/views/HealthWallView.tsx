"use client";
import { useState } from "react";
import type { IntelligenceData } from "@/hooks/useIntelligence";

interface TestResult {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

const VALID_MODES = ["REACTIVE", "STRUCTURAL_STRESS", "STRATEGIC_DRIFT", "BALANCED"];

function runTests(data: IntelligenceData): TestResult[] {
  const results: TestResult[] = [];

  const sevDescending = data.findings.every((f, i) => i === 0 || data.findings[i - 1].sev >= f.sev);
  results.push({ id: "HW-1", label: "Findings sorted by severity descending", pass: sevDescending, detail: `${data.findings.length} findings checked` });

  const sevInRange = data.findings.every((f) => f.sev >= 1 && f.sev <= 5);
  results.push({ id: "HW-2", label: "All finding severities in [1,5]", pass: sevInRange, detail: "range check" });

  const domainScoresOk = data.domainScores.every((d: any) => d.score >= 0 && d.score <= 100);
  results.push({ id: "HW-3", label: "All domain scores in [0,100]", pass: domainScoresOk, detail: `${data.domainScores.length} domains checked` });

  const healthOk = data.healthScore.overall >= 0 && data.healthScore.overall <= 100;
  results.push({ id: "HW-4", label: "Health score overall in [0,100]", pass: healthOk, detail: `overall=${data.healthScore.overall}` });

  const beliefKeys = Object.keys(data.beliefs ?? {});
  results.push({ id: "HW-5", label: "Beliefs object has 3 expected keys", pass: beliefKeys.length === 3, detail: beliefKeys.join(", ") });

  const hasStatusQuo = !!data.simulation?.scenarios?.STATUS_QUO;
  results.push({ id: "HW-6", label: "Simulation has STATUS_QUO scenario", pass: hasStatusQuo, detail: "scenario presence check" });

  const hoursOk = (data.attentionPlan?.totalHours ?? 0) <= (data.attentionPlan?.hoursBudget ?? 30);
  results.push({ id: "HW-7", label: "Attention plan total hours ≤ budget", pass: hoursOk, detail: `${data.attentionPlan?.totalHours}h used` });

  const modeOk = VALID_MODES.includes(data.temporalMode);
  results.push({ id: "HW-8", label: "Temporal mode is one of 4 valid values", pass: modeOk, detail: data.temporalMode });

  const entropyOk = data.orgEntropy >= 0 && data.orgEntropy <= 1;
  results.push({ id: "HW-9", label: "Org entropy between 0 and 1", pass: entropyOk, detail: `H=${data.orgEntropy}` });

  const hlaOk = !data.highestLeverageAction || (!!data.highestLeverageAction.action && !!data.highestLeverageAction.urgency);
  results.push({ id: "HW-10", label: "Highest leverage action has action + urgency fields", pass: hlaOk, detail: data.highestLeverageAction?.action ?? "none" });

  results.push({ id: "HW-11", label: "Flight risk is array", pass: Array.isArray(data.flightRisk), detail: `${data.flightRisk?.length ?? 0} entries` });
  results.push({ id: "HW-12", label: "Correlations is array", pass: Array.isArray(data.correlations), detail: `${data.correlations?.length ?? 0} entries` });
  results.push({ id: "HW-13", label: "Inferences is array", pass: Array.isArray(data.inferences), detail: `${data.inferences?.length ?? 0} entries` });
  results.push({ id: "HW-14", label: "Open goals is array", pass: Array.isArray(data.openGoals), detail: `${data.openGoals?.length ?? 0} entries` });

  return results;
}

export function HealthWallView({ data }: { data: IntelligenceData }) {
  const [results, setResults] = useState<TestResult[] | null>(null);

  const run = () => setResults(runTests(data));
  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-300">Self-test health wall</div>
        <button onClick={run} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white">
          Run health wall
        </button>
      </div>

      {results && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-sm text-slate-300">
            {passCount}/{results.length} tests passing
          </div>
          <table className="w-full text-sm">
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500 w-16">{r.id}</td>
                  <td className="px-4 py-2 text-slate-200">{r.label}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.detail}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${r.pass ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
                      {r.pass ? "PASS" : "FAIL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!results && <div className="text-sm text-slate-500">Run the health wall to execute 14 client-side invariant checks.</div>}
    </div>
  );
}
