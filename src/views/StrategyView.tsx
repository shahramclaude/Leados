"use client";
import React, { useEffect, useState } from "react";
import { Histogram } from "@/components/ui/svgCharts";
import type { ActivatedScenario, BoardPack, OKRHealthReport, WargameResult } from "@/lib/types";

const SEV_COLOR: Record<string, string> = { critical: "bg-rose-500/20 text-rose-300 border-rose-500/40", high: "bg-orange-500/20 text-orange-300 border-orange-500/40", medium: "bg-amber-500/20 text-amber-300 border-amber-500/40", low: "bg-slate-500/20 text-slate-300 border-slate-500/40" };
const HEALTH_COLOR: Record<string, string> = { on_track: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", at_risk: "bg-amber-500/20 text-amber-300 border-amber-500/40", off_track: "bg-rose-500/20 text-rose-300 border-rose-500/40" };

export function StrategyView() {
  const [okr, setOkr] = useState<OKRHealthReport | null>(null);
  const [scenarios, setScenarios] = useState<ActivatedScenario[]>([]);
  const [wargame, setWargame] = useState<WargameResult | null>(null);
  const [pack, setPack] = useState<BoardPack | null>(null);
  const [loadingPack, setLoadingPack] = useState(false);

  function load() {
    fetch("/api/strategic").then((r) => r.json()).then((d) => {
      setOkr(d.okr);
      setScenarios(d.scenarios);
      setWargame(d.wargame);
    });
  }
  useEffect(load, []);

  async function logProgress(goalId: string, krId: string, current: number) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "goal.progress", domain: "strategy", data: { goalId, keyResultId: krId, current } }),
    });
    load();
  }

  async function generatePack() {
    setLoadingPack(true);
    const r = await fetch("/api/strategic/board-pack", { method: "POST" });
    const d = await r.json();
    setPack(d.pack);
    setLoadingPack(false);
  }

  function exportMarkdown() {
    if (!pack) return;
    const md = `# Board Pack — ${new Date(pack.generatedAt).toLocaleDateString()}\n\n## Executive Summary\n${pack.executiveSummary}\n\n## Top 3 Risks\n${pack.top3Risks.map((r) => `- ${r}`).join("\n")}\n\n## Top 3 Decisions\n${pack.top3Decisions.map((r) => `- ${r}`).join("\n")}\n\n## Scenarios\n${pack.scenariosActive.count} active scenario(s). ${pack.scenariosActive.mostCritical ? `Most critical: ${pack.scenariosActive.mostCritical.narrative}` : ""}\n\n## Confidence\n${pack.confidenceStatement}\n`;
    navigator.clipboard.writeText(md);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">Strategy — OKRs, Scenarios &amp; War Gaming</h1>

      <section>
        <div className="mb-2 text-sm font-semibold text-slate-200">Objectives &amp; Key Results</div>
        <div className="space-y-3">
          {(okr?.objectives ?? []).map((o) => (
            <div key={o.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{o.title}</div>
                  <div className="text-[11px] text-slate-500">Owner: {o.owner} · velocity {(o.velocity * 100).toFixed(1)}%/wk {o.velocity >= 0 ? "↑" : "↓"}</div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${HEALTH_COLOR[o.health]}`}>{o.health.replace("_", " ")}</span>
              </div>
              <div className="mt-2 h-2 rounded bg-slate-800">
                <div className="h-2 rounded bg-sky-500" style={{ width: `${Math.round(o.progress * 100)}%` }} />
              </div>
              <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                {o.keyResults.map((kr) => (
                  <div key={kr.id} className="flex items-center gap-3 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase ${HEALTH_COLOR[kr.health]}`}>{kr.health.replace("_", " ")}</span>
                    <span className="flex-1 text-slate-300">{kr.title}</span>
                    <span className="text-slate-500">
                      {kr.current.toLocaleString()} / {kr.target.toLocaleString()} {kr.unit}
                    </span>
                    <input
                      type="number"
                      defaultValue={kr.current}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v) && v !== kr.current) logProgress(o.id, kr.id, v);
                      }}
                      className="w-20 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-right text-slate-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {okr && okr.objectives.length === 0 && <div className="text-xs text-slate-500">No OKRs logged yet.</div>}
        </div>
        {okr && (
          <div className="mt-2 text-xs text-slate-500">
            Team health score: <span className="font-semibold text-slate-300">{okr.teamHealthScore}/100</span> · {okr.onTrack} on track, {okr.atRisk} at risk, {okr.offTrack} off track
          </div>
        )}
      </section>

      {scenarios.length > 0 && (
        <section>
          <div className="mb-2 text-sm font-semibold text-slate-200">Activated Scenarios (Surveillance)</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {scenarios.map((s) => (
              <div key={s.metricKey} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-100">{s.metricLabel}</div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEV_COLOR[s.urgency]}`}>{s.urgency}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.sigma.toFixed(2)}σ from baseline ({s.baseline})</div>
                <Histogram
                  data={s.monteCarlo.histogram}
                  annotations={[
                    { label: "p10", value: s.monteCarlo.p10, color: "#38bdf8" },
                    { label: "p50", value: s.monteCarlo.p50, color: "#f472b6" },
                    { label: "p90", value: s.monteCarlo.p90, color: "#38bdf8" },
                  ]}
                />
                <p className="mt-2 text-[11px] text-slate-400">{s.narrative}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 text-sm font-semibold text-slate-200">War Game Panel</div>
        {wargame ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-sm text-slate-100">
              Our best move: <span className="font-semibold text-sky-300">{wargame.ourBestMove.label}</span>
            </div>
            <div className="mt-3 space-y-2">
              {wargame.expectedCompetitorCounters.map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                  <span className="font-semibold text-amber-300">{c.competitor.name}</span> likely counters with{" "}
                  <span className="text-slate-100">{c.move.label}</span> ({Math.round(c.likelihood * 100)}% likelihood)
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Blindspots: {wargame.blindspots.join(" ")}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">No competitive signals in last 14 days.</div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
          Board Pack Generator
          <button onClick={generatePack} disabled={loadingPack} className="ml-auto rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
            {loadingPack ? "Generating…" : "Generate Board Pack"}
          </button>
          {pack && (
            <button onClick={exportMarkdown} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600">
              Export as Text
            </button>
          )}
        </div>
        {pack && (
          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm">
            <p className="text-slate-200">{pack.executiveSummary}</p>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Top Risks</div>
              <ul className="list-disc pl-4 text-xs text-slate-300">
                {pack.top3Risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">Decisions Needed</div>
              <ul className="list-disc pl-4 text-xs text-slate-300">
                {pack.top3Decisions.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div dangerouslySetInnerHTML={{ __html: pack.okrSnapshotTable }} className="okr-table text-xs text-slate-300" />
            <p className="text-[11px] italic text-slate-500">{pack.confidenceStatement}</p>
          </div>
        )}
      </section>
      <style jsx global>{`
        .okr-table table { width: 100%; border-collapse: collapse; }
        .okr-table th, .okr-table td { border: 1px solid #334155; padding: 4px 8px; text-align: left; }
      `}</style>
    </div>
  );
}
