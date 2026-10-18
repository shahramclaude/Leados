"use client";

import { Fragment, useMemo, useState } from "react";
import Sparkline from "@/components/Sparkline";
import { useOrchestratorContext } from "@/lib/OrchestratorProvider";
import { DOMAINS, DOMAIN_LABELS, type Domain, type RuleEvaluation, type Severity } from "@/lib/types";

/**
 * SignalBoardView consumes the same `OrchestratorResult` contract as the
 * Cockpit (via `useOrchestratorContext()`), specifically:
 *   OrchestratorResult.ruleEvaluations[] (RuleEvaluation[] — includes `history: number[]`)
 *   OrchestratorResult.heatmap[]          (HeatmapCell[] — domain x day x maxSeverity)
 *   OrchestratorResult.causalChains[]     (CausalChain[])
 */

const SEVERITY_COLORS: Record<Severity | 0, string> = {
  0: "#1a1e27",
  1: "#334155",
  2: "#475569",
  3: "#eab308",
  4: "#d97706",
  5: "#dc2626",
};

function severityBadgeClass(sev: Severity): string {
  if (sev === 5) return "bg-red-600";
  if (sev === 4) return "bg-amber-600";
  if (sev === 3) return "bg-yellow-500";
  return "bg-slate-400";
}

export default function SignalBoardView() {
  const { result, connected } = useOrchestratorContext();
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<Set<Domain>>(new Set(DOMAINS));
  const [minSeverity, setMinSeverity] = useState<Severity | 0>(0);
  const [onlyChains, setOnlyChains] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const ruleToChains = useMemo(() => {
    const map = new Map<string, { id: string; description: string; amplificationFactor: number }[]>();
    for (const chain of result?.causalChains ?? []) {
      for (const key of chain.ruleKeys) {
        const list = map.get(key) ?? [];
        list.push({ id: chain.id, description: chain.description, amplificationFactor: chain.amplificationFactor });
        map.set(key, list);
      }
    }
    return map;
  }, [result]);

  const filteredRules: RuleEvaluation[] = useMemo(() => {
    const rules = result?.ruleEvaluations ?? [];
    return rules
      .filter((r) => domainFilter.has(r.domain))
      .filter((r) => r.severity >= minSeverity)
      .filter((r) => (onlyChains ? ruleToChains.has(r.ruleKey) : true))
      .filter(
        (r) =>
          !search.trim() ||
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.ruleKey.toLowerCase().includes(search.toLowerCase()),
      )
      .sort((a, b) => b.severity - a.severity || b.score - a.score);
  }, [result, domainFilter, minSeverity, onlyChains, search, ruleToChains]);

  const heatmapByCell = useMemo(() => {
    const map = new Map<string, Severity | 0>();
    for (const cell of result?.heatmap ?? []) {
      map.set(`${cell.domain}__${cell.date}`, cell.maxSeverity);
    }
    return map;
  }, [result]);

  const heatmapDates = useMemo(() => {
    const dates = Array.from(new Set((result?.heatmap ?? []).map((c) => c.date)));
    return dates.sort();
  }, [result]);

  const toggleDomain = (domain: Domain) => {
    setDomainFilter((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <div
      className="flex min-h-screen w-full flex-col text-slate-100"
      style={{ background: "linear-gradient(180deg, #0a0c10 0%, #0d1016 45%, #10131a 100%)" }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <h1 className="text-base font-semibold tracking-tight md:text-lg">Signal Board</h1>
        </div>
        <nav className="flex items-center gap-3 text-xs text-slate-400">
          <a href="/" className="min-h-[44px] content-center hover:text-slate-200">
            Cockpit
          </a>
          <a href="/signals" className="min-h-[44px] content-center text-indigo-400">
            Signal Board
          </a>
          <span className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-3 md:p-5">
        {/* Filters */}
        <section className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules by title or key…"
              className="min-h-[44px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-indigo-500 md:max-w-sm"
            />

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <label htmlFor="min-severity">Min severity</label>
              <select
                id="min-severity"
                value={minSeverity}
                onChange={(e) => setMinSeverity(Number(e.target.value) as Severity | 0)}
                className="min-h-[44px] rounded-md border border-slate-700 bg-slate-950 px-2 text-slate-100"
              >
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? "All" : s}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex min-h-[44px] items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={onlyChains}
                onChange={(e) => setOnlyChains(e.target.checked)}
                className="h-4 w-4"
              />
              Only causal-chain rules
            </label>

            <label className="flex min-h-[44px] items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="h-4 w-4"
              />
              Show heatmap
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((domain) => {
              const active = domainFilter.has(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => toggleDomain(domain)}
                  className={`flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                    active ? "border-indigo-500 bg-indigo-500/10 text-indigo-200" : "border-slate-700 text-slate-500"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: `var(--domain-${domain})` }}
                  />
                  {DOMAIN_LABELS[domain]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Severity heatmap: domain x last-7-days */}
        {showHeatmap && (
          <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Severity Heatmap — last 7 days
            </h2>
            <div className="min-w-[480px]">
              <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-1">
                <div />
                {heatmapDates.map((date) => (
                  <div key={date} className="text-center text-[10px] text-slate-500">
                    {new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                ))}
                {DOMAINS.map((domain) => (
                  <Fragment key={domain}>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: `var(--domain-${domain})` }}
                      />
                      {DOMAIN_LABELS[domain]}
                    </div>
                    {heatmapDates.map((date) => {
                      const sev = heatmapByCell.get(`${domain}__${date}`) ?? 0;
                      return (
                        <div
                          key={`${domain}-${date}`}
                          title={`${DOMAIN_LABELS[domain]} · ${date} · max sev ${sev || "none"}`}
                          className="h-6 rounded"
                          style={{ backgroundColor: SEVERITY_COLORS[sev] }}
                        />
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Rule list with sparklines + causal chain indicators */}
        <section className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Rules ({filteredRules.length})
          </h2>
          <div className="flex flex-col gap-2">
            {filteredRules.map((rule) => {
              const chains = ruleToChains.get(rule.ruleKey) ?? [];
              return (
                <div
                  key={rule.ruleKey}
                  className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--domain-${rule.domain})` }}
                    />
                    <span
                      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${severityBadgeClass(rule.severity)}`}
                    >
                      SEV {rule.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{rule.title}</p>
                      <p
                        className="truncate text-[11px] text-slate-500"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {rule.ruleKey}
                      </p>
                    </div>
                    {chains.length > 0 && (
                      <span
                        className="inline-flex shrink-0 cursor-help items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-300"
                        title={chains.map((c) => `${c.description} (×${c.amplificationFactor.toFixed(2)})`).join("\n")}
                      >
                        ⛓ {chains.length}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3 md:ml-auto">
                    <span
                      className="w-10 text-right text-sm font-semibold"
                      style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    >
                      {rule.score}
                    </span>
                    <Sparkline
                      values={rule.history}
                      stroke={rule.severity >= 4 ? "#f87171" : rule.severity === 3 ? "#eab308" : "#818cf8"}
                    />
                  </div>
                </div>
              );
            })}
            {filteredRules.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No rules match the current filters.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
