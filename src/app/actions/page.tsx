import { db } from "@/db";
import { recommendations, attentionLedger, banditArms } from "@/db/schema";
import { desc } from "drizzle-orm";
import { generateRecommendationAction, markRecommendationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const open = await db.select().from(recommendations).orderBy(desc(recommendations.createdAt));
  const today = new Date().toISOString().slice(0, 10);
  const ledgers = await db.select().from(attentionLedger);
  const arms = await db.select().from(banditArms);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 64</p>
        <h1 className="text-2xl font-semibold text-white">Next-Best-Action &amp; Personalization Brain</h1>
        <p className="mt-1 text-sm text-slate-400">
          Thompson-sampling bandit over candidate arms with a 5% forced exploration floor, a manipulation denylist
          (urgency/scarcity/FOMO patterns are hard-banned), and a per-role daily attention budget the brain respects
          by staying quiet once it&apos;s spent.
        </p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Generate a recommendation</h2>
        <form action={generateRecommendationAction} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Role
            <select name="role" className="mt-1 block">
              <option value="manager">manager</option>
              <option value="executive">executive</option>
              <option value="contributor">contributor</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            Select next-best-action
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Attention budget today ({today})</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {ledgers
            .filter((l) => l.periodDate === today)
            .map((l) => (
              <div key={l.id}>
                <p className="text-xs text-slate-400">{l.role}</p>
                <div className="mt-1 h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (l.spent / l.budget) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {l.spent}/{l.budget} spent
                </p>
              </div>
            ))}
          {ledgers.filter((l) => l.periodDate === today).length === 0 && (
            <p className="text-xs text-slate-500">No attention spent yet today.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Recommendation feed</h2>
        <div className="mt-3 space-y-3">
          {open.length === 0 && <p className="text-sm text-slate-500">No recommendations yet — generate one above.</p>}
          {open.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">{r.title}</p>
                <div className="flex items-center gap-2">
                  {r.explored && <span className="badge bg-indigo-500/20 text-indigo-300">exploration</span>}
                  <span
                    className={`badge ${
                      r.status === "done" ? "bg-emerald-500/20 text-emerald-300" : r.status === "dismissed" ? "bg-slate-800 text-slate-400" : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-400">{r.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                role {r.role} · expected value {r.expectedValue} · attention cost {r.costAttention} · risk {r.riskTier}
              </p>
              {r.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <form action={markRecommendationAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="done" />
                    <button className="btn btn-primary" type="submit">
                      Mark done
                    </button>
                  </form>
                  <form action={markRecommendationAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="dismissed" />
                    <button className="btn btn-secondary" type="submit">
                      Dismiss
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Bandit arm posteriors</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>Arm</th>
              <th>Alpha</th>
              <th>Beta</th>
              <th>Pulls</th>
              <th>Est. success rate</th>
            </tr>
          </thead>
          <tbody>
            {arms.map((a) => (
              <tr key={a.id}>
                <td>{a.label}</td>
                <td>{a.alpha.toFixed(1)}</td>
                <td>{a.beta.toFixed(1)}</td>
                <td>{a.pulls}</td>
                <td>{((a.alpha / (a.alpha + a.beta)) * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
