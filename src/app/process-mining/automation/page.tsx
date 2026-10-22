"use client";

import { useState } from "react";
import { ProcessShell } from "@/components/processMining/ProcessShell";
import { formatDuration, formatNumber, formatPct } from "@/components/processMining/format";

interface Explain {
  value: number;
  formula: string;
  inputs: Record<string, number | string | boolean>;
  citations: string[];
  confidence: "measured" | "estimated";
  notes?: string[];
}
interface AutomationScore {
  processName: string;
  activity: string;
  volumeAnnualized: number;
  avgHandlingTimeHours: number;
  errorRate: number;
  ruleBasedFraction: number;
  automationCost: number;
  score: Explain;
  roi: { savedHoursPerYear: number; fteEquivalent: number; additionalCaseThroughputPerYear: number; twinNote: string };
}
interface Data {
  ok: boolean;
  error?: string;
  automation?: AutomationScore[];
  proposals?: { id: number; activity: string; status: string }[];
}

export default function AutomationRoiPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [processName, setProcessName] = useState("benchmark_flow");
  const [proposing, setProposing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async (name: string) => {
    setProcessName(name);
    setLoading(true);
    try {
      const res = await fetch(`/api/process-mining/automation?processName=${encodeURIComponent(name)}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const propose = async (activity: string) => {
    setProposing(activity);
    setMessage(null);
    try {
      const res = await fetch("/api/process-mining/automation/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processName, activity }),
      });
      const json = await res.json();
      setMessage(json.ok ? `Draft proposal #${json.proposalId} created for "${activity}".` : `Failed: ${json.error}`);
      await load(processName);
    } finally {
      setProposing(null);
    }
  };

  const scores = data?.automation ?? [];

  return (
    <ProcessShell onProcessChange={load}>
      {() => (
        <div>
          {loading && <p className="text-sm text-slate-500">Scoring automation opportunities…</p>}
          {!loading && data && !data.ok && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{data.error}</div>
          )}
          {message && <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm text-blue-800">{message}</div>}

          {!loading && data?.ok && (
            <div className="space-y-4">
              {scores.map((s) => (
                <div key={s.activity} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{s.activity}</h3>
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          s.score.confidence === "measured" ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {s.score.confidence === "measured" ? "measured inputs" : "estimated inputs — directional only"}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase text-slate-500">Score</p>
                      <p className="text-xl font-semibold text-slate-950">{formatNumber(s.score.value, 3)}</p>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600 md:grid-cols-4">
                    <span>Volume/yr: {formatNumber(s.volumeAnnualized, 0)}</span>
                    <span>Handling time: {formatDuration(s.avgHandlingTimeHours * 3_600_000)}</span>
                    <span>Error rate: {formatPct(s.errorRate)}</span>
                    <span>Rule-based: {formatPct(s.ruleBasedFraction)}</span>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">{s.score.formula}</p>
                  {s.score.notes?.map((n, i) => (
                    <p key={i} className="mt-1 text-xs text-amber-700">
                      ⚠ {n}
                    </p>
                  ))}

                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-800">Capacity impact (twin stand-in)</p>
                    <p className="text-slate-600">
                      Saved capacity: ~{formatNumber(s.roi.savedHoursPerYear, 0)} hrs/yr (~{formatNumber(s.roi.fteEquivalent, 2)} FTE) · could
                      absorb ~{formatNumber(s.roi.additionalCaseThroughputPerYear, 0)} more cases/yr at this step alone.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{s.roi.twinNote}</p>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-xs text-slate-400">Citations (sample event ids): {s.score.citations.join(", ") || "none"}</p>
                    <button
                      onClick={() => propose(s.activity)}
                      disabled={proposing === s.activity}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {proposing === s.activity ? "Proposing…" : "Propose automation → capability registry draft"}
                    </button>
                  </div>
                </div>
              ))}

              {data.proposals && data.proposals.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-900">Draft proposals on file</h3>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {data.proposals.map((p) => (
                      <li key={p.id}>
                        #{p.id} — {p.activity} — <span className="uppercase">{p.status}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-slate-400">
                    Part 10&apos;s capability registry is not present in this repo snapshot — these drafts are the hand-off artifact a
                    future importer (or a human reviewer) would promote.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ProcessShell>
  );
}
