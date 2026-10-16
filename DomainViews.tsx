import type { Store } from "../types";
import type { Projected } from "../lib/engine";
import { Badge, Card, SectionTitle, SevBadge } from "../components/primitives";
import { navigate, buildExplainLink } from "../lib/router";
import { DOMAINS } from "../data/catalog";

export function FinanceView({ P }: { P: Projected; storeState: Store }) {
  const findings = P.findings.filter((f) => f.domain === "finance");
  return (
    <div>
      <SectionTitle sub="P&L trend, runway and the finance-domain findings derived from it.">Finance</SectionTitle>
      <Card className="mb-4 p-4">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">plHealth() — gross margin / growth by period</div>
        {P.plPeriods.length === 0 ? (
          <div className="text-sm text-slate-500">No fin.pl.logged events yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr><th className="py-1">Period</th><th>Revenue</th><th>Gross margin %</th><th>Growth %</th><th>Rule of 40</th></tr>
            </thead>
            <tbody>
              {P.plPeriods.map((p) => (
                <tr key={p.period} className="border-t border-slate-100">
                  <td className="py-1.5 font-medium">{p.period}</td>
                  <td>${p.revenue.toLocaleString()}</td>
                  <td>{p.gross_margin_pct}%</td>
                  <td>{p.growth_pct}%</td>
                  <td className={p.gross_margin_pct + p.growth_pct < 40 ? "text-red-600" : "text-emerald-600"}>{p.gross_margin_pct + p.growth_pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <FindingsList findings={findings} />
    </div>
  );
}

export function IntelligenceView({ P }: { P: Projected; storeState: Store }) {
  const counts = new Map<string, { count: number; topSev: number }>();
  P.findings.forEach((f) => {
    const cur = counts.get(f.domain) || { count: 0, topSev: 0 };
    cur.count += 1;
    cur.topSev = Math.max(cur.topSev, f.sev);
    counts.set(f.domain, cur);
  });
  return (
    <div>
      <SectionTitle sub="Cross-domain heat — which domains are generating the most / most severe findings right now.">Intelligence</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DOMAINS.map((d) => {
          const c = counts.get(d) || { count: 0, topSev: 0 };
          return (
            <Card key={d} className="cursor-pointer p-4 hover:border-violet-300" onClick={() => navigate(`#/today?domain=${d}`)}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">#{d}</span>
                {c.count > 0 && <SevBadge sev={c.topSev} />}
              </div>
              <div className="mt-1 text-sm text-slate-500">{c.count} active finding{c.count === 1 ? "" : "s"}</div>
            </Card>
          );
        })}
      </div>
      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Top findings system-wide</div>
        <FindingsList findings={P.findings.slice(0, 8)} />
      </div>
    </div>
  );
}

export function SelfView({ P, storeState }: { P: Projected; storeState: Store }) {
  const opsLogs = storeState.events.filter((e) => e.type === "ops.review.logged");
  const decisions = storeState.events.filter((e) => e.type === "decision.opened");
  const closedIds = new Set(storeState.events.filter((e) => e.type === "decision.closed").map((e) => String(e.data.id)));
  const openDecisions = decisions.filter((d) => !closedIds.has(String(d.data.id)));
  return (
    <div>
      <SectionTitle sub="Your own operating rhythm — reviews run, decisions open, and findings about you.">Self</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-2xl font-semibold text-slate-900">{opsLogs.length}</div><div className="text-xs text-slate-500">ops reviews logged (all time)</div></Card>
        <Card className="p-4"><div className="text-2xl font-semibold text-slate-900">{openDecisions.length}</div><div className="text-xs text-slate-500">decisions currently open</div></Card>
        <Card className="p-4"><div className="text-2xl font-semibold text-slate-900">{P.findings.filter((f) => f.domain === "ops" || f.domain === "strategy").length}</div><div className="text-xs text-slate-500">ops/strategy findings active</div></Card>
      </div>
      <div className="mt-6">
        <FindingsList findings={P.findings.filter((f) => f.domain === "ops" || f.domain === "strategy")} />
      </div>
    </div>
  );
}

function FindingsList({ findings }: { findings: Projected["findings"] }) {
  if (findings.length === 0) return <div className="text-sm text-slate-500">Nothing active.</div>;
  return (
    <div className="space-y-2">
      {findings.map((f) => (
        <Card key={f.key} className="p-3">
          <div className="flex items-center gap-2">
            <SevBadge sev={f.sev} />
            <button className="font-mono text-xs text-violet-700 hover:underline" onClick={() => navigate(buildExplainLink(f.rule))}>{f.rule}</button>
            <Badge tone="slate">#{f.smartRank}</Badge>
          </div>
          <div className="mt-1 text-sm text-slate-800">{f.title}</div>
        </Card>
      ))}
    </div>
  );
}
