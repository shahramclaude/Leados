import { db } from "@/db";
import { initiatives, portfolioConstraints, objectives, keyResults } from "@/db/schema";
import { wsjf } from "@/lib/strategy";
import { optimizePortfolioAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const allInitiatives = await db.select().from(initiatives);
  const constraints = await db.select().from(portfolioConstraints);
  const allObjectives = await db.select().from(objectives);
  const allKeyResults = await db.select().from(keyResults);

  const scored = allInitiatives
    .map((i) => ({ ...i, computedWsjf: wsjf({ value: i.value, timeCriticality: i.timeCriticality, riskReduction: i.riskReduction, size: i.size }) }))
    .sort((a, b) => b.computedWsjf - a.computedWsjf);

  const usage = {
    budget: allInitiatives.filter((i) => i.status === "selected").reduce((a, b) => a + b.costUsd, 0),
    headcount: allInitiatives.filter((i) => i.status === "selected").reduce((a, b) => a + b.headcount, 0),
    capacity: allInitiatives.filter((i) => i.status === "selected").reduce((a, b) => a + b.size, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 62</p>
        <h1 className="text-2xl font-semibold text-white">Autonomous Strategy, OKR &amp; Portfolio Engine</h1>
        <p className="mt-1 text-sm text-slate-400">
          WSJF = (value + time-criticality + risk-reduction) / size. The optimizer is a greedy-by-WSJF seed plus a
          bounded 2-swap local search — deterministic, constraint-respecting, and honest about not being a certified
          ILP optimum.
        </p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Objectives &amp; Key Results</h2>
        <div className="mt-3 space-y-3">
          {allObjectives.map((o) => (
            <div key={o.id} className="rounded-xl border border-slate-800 p-3">
              <p className="text-sm text-slate-100">{o.statement}</p>
              <p className="text-xs text-slate-500">
                owner {o.owner} · baseline {o.baseline} → target {o.target} · falsifiable by {o.falsifiableBy} · confidence {o.confidence}
                {o.ambitiousUnsupported && <span className="ml-2 badge bg-amber-500/20 text-amber-300">ambitious-unsupported</span>}
              </p>
              <ul className="mt-2 space-y-1">
                {allKeyResults
                  .filter((k) => k.objectiveId === o.id)
                  .map((k) => (
                    <li key={k.id} className="text-xs text-slate-400">
                      {k.title}: {k.fromVal} → {k.toVal} (current {k.current}){" "}
                      {k.isCounterMetric && <span className="badge bg-indigo-500/20 text-indigo-300">counter-metric</span>}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Portfolio constraints &amp; usage (selected initiatives)</h2>
          <form action={optimizePortfolioAction}>
            <button className="btn btn-primary" type="submit">
              Re-solve portfolio
            </button>
          </form>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          {constraints.map((c) => {
            const used = c.kind === "budget" ? usage.budget : c.kind === "headcount" ? usage.headcount : usage.capacity;
            const pct = Math.min(100, (used / c.limitValue) * 100);
            return (
              <div key={c.id}>
                <p className="text-xs text-slate-400">{c.label}</p>
                <div className="mt-1 h-2 rounded-full bg-slate-800">
                  <div
                    className={`h-2 rounded-full ${pct > 95 ? "bg-rose-500" : "bg-indigo-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {used.toFixed(0)} / {c.limitValue} {c.hard ? "(hard)" : "(soft)"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Initiative board (ranked by WSJF)</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Initiative</th>
              <th>WSJF</th>
              <th>Size (wks)</th>
              <th>Cost</th>
              <th>Irreversible</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>{i.computedWsjf.toFixed(2)}</td>
                <td>{i.size}</td>
                <td>${i.costUsd.toLocaleString()}</td>
                <td>{i.irreversible ? "yes (score halved)" : "no"}</td>
                <td>
                  <span
                    className={`badge ${
                      i.status === "selected"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : i.status === "dropped"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {i.status}
                  </span>
                  {i.droppedReason && <p className="mt-1 text-xs text-slate-500">{i.droppedReason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
