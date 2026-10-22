"use client";

import { useState } from "react";
import { ProcessShell } from "@/components/processMining/ProcessShell";
import { formatPct } from "@/components/processMining/format";

interface Deviation {
  type: string;
  detail: string;
  activity?: string;
  severity: "statistical" | "rule";
}
interface CaseResult {
  caseId: string;
  conformant: boolean;
  deviations: Deviation[];
}
interface Report {
  processName: string;
  checkedAgainst: "mined" | "declared";
  caseCount: number;
  conformantCount: number;
  conformanceRate: number;
  results: CaseResult[];
}
interface Data {
  ok: boolean;
  error?: string;
  mode?: string;
  honestyNote?: string;
  report?: Report;
}

export default function ConformanceExplorerPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"mined" | "declared">("declared");
  const [processName, setProcessName] = useState("benchmark_flow");

  const load = async (name: string, nextMode: "mined" | "declared" = mode) => {
    setProcessName(name);
    setLoading(true);
    try {
      const res = await fetch(`/api/process-mining/conformance?processName=${encodeURIComponent(name)}&mode=${nextMode}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProcessShell onProcessChange={(name) => load(name)}>
      {() => (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">Check against:</span>
            {(["declared", "mined"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  load(processName, m);
                }}
                className={`rounded-md px-3 py-1 text-sm ${mode === m ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300"}`}
              >
                {m === "declared" ? "Declared process (rule violations)" : "Mined model (statistical rarity)"}
              </button>
            ))}
          </div>

          {loading && <p className="text-sm text-slate-500">Replaying cases against the model…</p>}
          {!loading && data && !data.ok && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{data.error}</div>
          )}
          {!loading && data?.ok && data.report && (
            <>
              <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <p className="font-semibold text-slate-900">{data.honestyNote}</p>
                <p className="mt-2 text-slate-600">
                  Conformance rate: <span className="font-semibold">{formatPct(data.report.conformanceRate)}</span> (
                  {data.report.conformantCount}/{data.report.caseCount} cases) — {" "}
                  {mode === "declared"
                    ? "conformant means zero rule-severity deviations; statistical deviations (e.g. rework) are shown but don't count against it."
                    : "every case is technically 'conformant' here because statistical rarity alone is never treated as a violation — read the deviation list instead of the rate."}
                </p>
              </div>

              <div className="space-y-2">
                {data.report.results.map((r) => (
                  <div key={r.caseId} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{r.caseId}</span>
                      <span className={`rounded px-2 py-0.5 text-xs ${r.conformant ? "bg-emerald-50 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                        {r.conformant ? "conformant" : "rule violation"}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {r.deviations.map((d, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                              d.severity === "rule" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {d.severity}
                          </span>
                          <span className="text-slate-700">
                            <span className="font-medium">{d.type}</span> — {d.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {data.report.results.length === 0 && (
                  <p className="text-sm text-slate-500">No deviations found in this window — every case followed the typical/declared path.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </ProcessShell>
  );
}
