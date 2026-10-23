import { listSuitesWithLatestRun } from "@/lib/evalFabric";
import { db } from "@/db";
import { goldenExamples } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runSuiteAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const suites = await listSuitesWithLatestRun();
  const examplesBySuite = new Map<string, (typeof goldenExamples.$inferSelect)[]>();
  for (const s of suites) {
    examplesBySuite.set(s.id, await db.select().from(goldenExamples).where(eq(goldenExamples.suiteId, s.id)));
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 66</p>
        <h1 className="text-2xl font-semibold text-white">Self-Improving Quality &amp; Eval Fabric</h1>
        <p className="mt-1 text-sm text-slate-400">
          Golden examples re-execute the real simulation pipeline against an acceptance band and forbidden-output
          list — a genuine regression gate, not a replayed fixture. One example per suite is deliberately
          adversarial (an extreme intervention) to catch runaway extrapolation.
        </p>
      </div>

      <div className="space-y-4">
        {suites.map((s) => {
          const examples = examplesBySuite.get(s.id) ?? [];
          return (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">{s.name}</h2>
                  <p className="text-xs text-slate-500">
                    surface: {s.surface} · {examples.length} golden examples ({examples.filter((e) => e.adversarial).length} adversarial)
                  </p>
                </div>
                <form action={runSuiteAction}>
                  <input type="hidden" name="suiteId" value={s.id} />
                  <button className="btn btn-primary" type="submit">
                    Run suite
                  </button>
                </form>
              </div>
              {s.latestRun ? (
                <div className="mt-3">
                  <span
                    className={`badge ${
                      s.latestRun.passRate >= 0.85 ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    pass rate {(s.latestRun.passRate * 100).toFixed(0)}% ({s.latestRun.passCount}/{s.latestRun.totalCount}) — last run{" "}
                    {new Date(s.latestRun.runAt!).toLocaleString()}
                  </span>
                  <table className="mt-3">
                    <thead>
                      <tr>
                        <th>Example</th>
                        <th>Result</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(s.latestRun.details as { exampleId: string; pass: boolean; observed: number | null; reason: string }[]).map((d) => (
                        <tr key={d.exampleId}>
                          <td>{d.exampleId}</td>
                          <td>
                            <span className={`badge ${d.pass ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                              {d.pass ? "pass" : "fail"}
                            </span>
                          </td>
                          <td>{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Never run — this is an honest &quot;unknown&quot;, not a pass.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
