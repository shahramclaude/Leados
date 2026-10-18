"use client";

import { useEffect, useMemo, useState } from "react";
import DomainRadar from "@/components/DomainRadar";
import FindingCard from "@/components/FindingCard";
import Sparkline from "@/components/Sparkline";
import { useOrchestratorContext } from "@/lib/OrchestratorProvider";
import { DOMAIN_LABELS, type Domain, type Finding, type Hypothesis } from "@/lib/types";

/**
 * CockpitView is the leadership "one glance" surface. It consumes the
 * shared `useOrchestratorContext()` state — a `{ result: OrchestratorResult, ... }`
 * contract from src/lib/useOrchestrator.ts — so it never opens its own SSE
 * connection. Field paths used below:
 *   OrchestratorResult.domainScores[].{domain,score,priorScore}
 *   OrchestratorResult.orgHealthScore / priorOrgHealthScore
 *   OrchestratorResult.findings[]            (Finding[])
 *   OrchestratorResult.risks[]                (RiskItem[])
 *   OrchestratorResult.people[]                (PersonRisk[])
 *   OrchestratorResult.decisions[]             (DecisionItem[])
 *   OrchestratorResult.decisionHealthIndex / cycleTimeTrend
 *   OrchestratorResult.causalChains[] / playbooks
 */

type IntelTab = "risks" | "people" | "hypotheses" | "pipeline";

function timeAgo(date: Date | null): string {
  if (!date) return "never";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

export default function CockpitView() {
  const { result, lastUpdated, connected, running, triggerRun } = useOrchestratorContext();
  const [tab, setTab] = useState<IntelTab>("risks");
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [, forceTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/hypothesis")
      .then((res) => res.json())
      .then((data: Hypothesis[]) => {
        if (!cancelled) setHypotheses(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [result?.generatedAt]);

  // Re-render every 30s so "X minutes ago" stays fresh without a new fetch.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const domainScoreMap = useMemo(() => {
    if (!result) return null;
    const current: Partial<Record<Domain, number>> = {};
    const prior: Partial<Record<Domain, number>> = {};
    for (const d of result.domainScores) {
      current[d.domain] = d.score;
      prior[d.domain] = d.priorScore;
    }
    return { current: current as Record<Domain, number>, prior: prior as Record<Domain, number> };
  }, [result]);

  const grouped = useMemo(() => {
    const findings = result?.findings ?? [];
    const critical: Finding[] = [];
    const warning: Finding[] = [];
    const info: Finding[] = [];
    for (const f of findings) {
      if (f.severity === 5) critical.push(f);
      else if (f.severity === 4 || f.severity === 3) warning.push(f);
      else info.push(f);
    }
    return { critical, warning, info };
  }, [result]);

  const causalChainMap = useMemo(
    () => new Map((result?.causalChains ?? []).map((c) => [c.id, c.description])),
    [result],
  );

  const orgDelta = result ? result.orgHealthScore - result.priorOrgHealthScore : 0;

  const paletteActions = [
    { label: "Run Analysis", run: () => void triggerRun() },
    { label: "Jump to Signal Board", run: () => window.location.assign("/signals") },
    { label: "Jump to Cockpit", run: () => window.location.assign("/") },
  ].filter((a) => a.label.toLowerCase().includes(paletteQuery.toLowerCase()));

  return (
    <div
      className="flex min-h-screen w-full flex-col text-slate-100"
      style={{ background: "linear-gradient(180deg, #0a0c10 0%, #0d1016 45%, #10131a 100%)" }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <h1 className="text-base font-semibold tracking-tight text-slate-100 md:text-lg">
            Leados Command Center
          </h1>
        </div>
        <nav className="flex items-center gap-3 text-xs text-slate-400">
          <a href="/" className="min-h-[44px] content-center text-indigo-400">
            Cockpit
          </a>
          <a href="/signals" className="min-h-[44px] content-center hover:text-slate-200">
            Signal Board
          </a>
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-3 md:grid md:grid-cols-[300px_1fr_340px] md:gap-4 md:p-5">
        {/* LEFT: Org Health Radar */}
        <section className="flex flex-col items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="self-start text-xs font-semibold uppercase tracking-wider text-slate-400">
            Org Health Radar
          </h2>
          {domainScoreMap ? (
            <DomainRadar scores={domainScoreMap.current} priorScores={domainScoreMap.prior} size={260} />
          ) : (
            <div className="grid h-64 w-64 place-items-center text-sm text-slate-500">Loading…</div>
          )}
          <div className="flex flex-col items-center">
            <span
              className="text-4xl font-bold tracking-tight"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {result?.orgHealthScore ?? "—"}
            </span>
            <span
              className={`text-sm font-medium ${
                orgDelta > 0 ? "text-emerald-400" : orgDelta < 0 ? "text-red-400" : "text-slate-400"
              }`}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {orgDelta > 0 ? "+" : ""}
              {orgDelta} vs 7d ago
            </span>
            <span className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
              Org Health Score
            </span>
          </div>
        </section>

        {/* CENTER: Live Signal Feed */}
        <section className="flex min-h-[400px] flex-col rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Live Signal Feed
          </h2>

          {!result || result.findings.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl text-emerald-400">✓</span>
              <p className="text-sm text-slate-300">All clear — no active findings</p>
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1 md:max-h-[calc(100vh-220px)]">
              {grouped.critical.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">
                    Critical
                  </p>
                  {grouped.critical.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      playbookExists={Boolean(result.playbooks[f.ruleKey])}
                      causalChainDescription={f.causalChainId ? causalChainMap.get(f.causalChainId) : null}
                      pulse
                    />
                  ))}
                </div>
              )}

              {grouped.warning.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-400">
                    Warning
                  </p>
                  {grouped.warning.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      playbookExists={Boolean(result.playbooks[f.ruleKey])}
                      causalChainDescription={f.causalChainId ? causalChainMap.get(f.causalChainId) : null}
                    />
                  ))}
                </div>
              )}

              {grouped.info.length > 0 && (
                <details className="rounded-lg border border-slate-800">
                  <summary className="min-h-[44px] cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Informational ({grouped.info.length})
                  </summary>
                  <div className="flex flex-col gap-2 p-2 pt-0">
                    {grouped.info.map((f) => (
                      <FindingCard
                        key={f.id}
                        finding={f}
                        playbookExists={Boolean(result.playbooks[f.ruleKey])}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </section>

        {/* RIGHT: Intelligence Panels */}
        <section className="flex flex-col rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-md bg-slate-950/60 p-1 text-xs">
            {(
              [
                ["risks", "Risks"],
                ["people", "People"],
                ["hypotheses", "Hypotheses"],
                ["pipeline", "Pipeline"],
              ] as [IntelTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`min-h-[36px] flex-1 whitespace-nowrap rounded px-2 py-1.5 font-medium transition-colors ${
                  tab === key ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {tab === "risks" && (
              <ul className="flex flex-col gap-2">
                {(result?.risks ?? []).map((r) => (
                  <li
                    key={`${r.id}-${r.title}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: `var(--domain-${r.domain})` }}
                      />
                      <span className="text-xs text-slate-400">{DOMAIN_LABELS[r.domain]}</span>
                      {r.amplificationFactor && (
                        <span className="ml-auto rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300">
                          ×{r.amplificationFactor.toFixed(2)} amp
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-100">{r.title}</p>
                    <p
                      className="mt-1 text-[11px] text-slate-500"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      p={r.probability.toFixed(2)} · impact={Math.round(r.impact)}
                    </p>
                  </li>
                ))}
                {!result?.risks.length && <li className="text-sm text-slate-500">No active risks.</li>}
              </ul>
            )}

            {tab === "people" && result && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                    Org Burnout Index
                  </p>
                  {(() => {
                    const avgBurnout = result.people.length
                      ? Math.round(
                          result.people.reduce((a, p) => a + p.burnoutIndex, 0) / result.people.length,
                        )
                      : 0;
                    return (
                      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full ${
                            avgBurnout > 70 ? "bg-red-600" : avgBurnout > 50 ? "bg-amber-600" : "bg-emerald-500"
                          }`}
                          style={{ width: `${avgBurnout}%` }}
                        />
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Top Flight Risks</p>
                  {result.people.slice(0, 3).map((p) => (
                    <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-100">{p.name}</span>
                        <span
                          className="text-xs text-red-400"
                          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        >
                          {Math.round(p.flightRiskProbability * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{p.role}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[10px] text-slate-500">1:1 cadence</span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              p.cadenceHealth > 65 ? "bg-emerald-500" : p.cadenceHealth > 40 ? "bg-amber-600" : "bg-red-600"
                            }`}
                            style={{ width: `${p.cadenceHealth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "hypotheses" && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Open</p>
                  <ul className="flex flex-col gap-2">
                    {hypotheses
                      .filter((h) => h.status === "open")
                      .map((h) => (
                        <li
                          key={h.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
                        >
                          <p className="text-slate-100">{h.statement}</p>
                          <p
                            className="mt-1 text-[11px] text-indigo-300"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                          >
                            {h.daysToResolve >= 0 ? `${h.daysToResolve}d to resolve` : "overdue"}
                          </p>
                        </li>
                      ))}
                    {hypotheses.filter((h) => h.status === "open").length === 0 && (
                      <li className="text-sm text-slate-500">No open hypotheses.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">History</p>
                  <ul className="flex flex-col gap-2">
                    {hypotheses
                      .filter((h) => h.status !== "open")
                      .map((h) => (
                        <li
                          key={h.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
                        >
                          <span
                            className={
                              h.status === "confirmed" ? "text-emerald-400" : "text-red-400"
                            }
                          >
                            {h.status === "confirmed" ? "✓ Confirmed" : "✗ Refuted"}
                          </span>
                          <p className="mt-1 text-slate-300">{h.statement}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            )}

            {tab === "pipeline" && result && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Decision Health Index
                  </p>
                  <p
                    className="text-2xl font-bold"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {result.decisionHealthIndex}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Avg cycle time trend
                    </p>
                    <Sparkline values={result.cycleTimeTrend} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    Overdue decisions
                  </p>
                  {result.decisions
                    .filter((d) => d.overdue)
                    .map((d) => (
                      <div key={d.id} className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2">
                        <p className="text-sm text-slate-100">{d.title}</p>
                        <p className="text-[11px] text-slate-500">
                          Owner: {d.owner} · due {new Date(d.dueAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  {result.decisions.filter((d) => d.overdue).length === 0 && (
                    <p className="text-sm text-slate-500">No overdue decisions.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* BOTTOM BAR */}
      <footer className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-800 bg-slate-950/90 px-4 py-2 backdrop-blur md:px-6">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
            aria-label={connected ? "Connected" : "Disconnected"}
          />
          {connected ? "Live" : "Reconnecting…"}
        </div>

        <span className="text-xs text-slate-500">Last analyzed: {timeAgo(lastUpdated)}</span>
        {running && (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        )}

        <button
          type="button"
          onClick={() => void triggerRun()}
          disabled={running}
          className="ml-auto min-h-[44px] rounded-md bg-indigo-500 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
        >
          {running ? "Running…" : "Run Analysis"}
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="min-h-[44px] rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:border-indigo-500 hover:text-indigo-300"
        >
          ⌘K
        </button>
      </footer>

      {paletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-24"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={paletteQuery}
              onChange={(e) => setPaletteQuery(e.target.value)}
              placeholder="Type a command…"
              className="mb-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
            <ul className="flex flex-col gap-1">
              {paletteActions.map((a) => (
                <li key={a.label}>
                  <button
                    type="button"
                    onClick={() => {
                      a.run();
                      setPaletteOpen(false);
                      setPaletteQuery("");
                    }}
                    className="min-h-[44px] w-full rounded-md px-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                  >
                    {a.label}
                  </button>
                </li>
              ))}
              {paletteActions.length === 0 && (
                <li className="px-3 py-2 text-sm text-slate-500">No matching commands.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
