import { db } from "@/db";
import { incidents, metrics, causalEdges } from "@/db/schema";
import { desc } from "drizzle-orm";
import { runDiscoveryAction, runDetectionAction, closeIncidentAction, markHypothesisTestedAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CausalPage() {
  const allIncidents = await db.select().from(incidents).orderBy(desc(incidents.detectedAt));
  const allMetrics = await db.select().from(metrics);
  const metricById = new Map(allMetrics.map((m) => [m.id, m]));
  const edges = await db.select().from(causalEdges);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Part 61</p>
        <h1 className="text-2xl font-semibold text-white">Causal Discovery &amp; Autonomous Root-Cause</h1>
        <p className="mt-1 text-sm text-slate-400">
          EWMA change-point detection → lagged-correlation causal screen with Benjamini–Hochberg FDR control and
          bootstrap stability → noisy-OR attribution. An incident cannot be closed until its top cause is marked
          tested — a hard block, not a suggestion.
        </p>
      </div>

      <div className="flex gap-3">
        <form action={runDetectionAction}>
          <button className="btn btn-primary" type="submit">
            Run change-point detection sweep
          </button>
        </form>
        <form action={runDiscoveryAction}>
          <button className="btn btn-secondary" type="submit">
            Rebuild causal graph
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Discovered causal edges ({edges.length})</h2>
        <table className="mt-3">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Lag</th>
              <th>Strength</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => (
              <tr key={e.id}>
                <td>{metricById.get(e.fromMetricId)?.label ?? e.fromMetricId}</td>
                <td>{metricById.get(e.toMetricId)?.label ?? e.toMetricId}</td>
                <td>{e.lagPeriods}</td>
                <td>{e.strength.toFixed(2)}</td>
                <td>
                  <span className={`badge ${e.stable ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {e.validated}
                    {e.stable ? " · stable" : " · unstable"}
                  </span>
                </td>
              </tr>
            ))}
            {edges.length === 0 && (
              <tr>
                <td colSpan={5} className="text-slate-500">
                  No edges discovered yet — run the discovery job.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-200">Incidents ({allIncidents.length})</h2>
        <div className="mt-3 space-y-4">
          {allIncidents.length === 0 && <p className="text-sm text-slate-500">No incidents filed yet.</p>}
          {allIncidents.map((inc) => {
            const causes = (inc.causes as {
              factor: string;
              score: number;
              evidenceStrength: number;
              testableHypothesis: string;
            }[]) ?? [];
            return (
              <div key={inc.id} className="rounded-xl border border-slate-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">
                    {metricById.get(inc.metricId)?.label ?? inc.metricId} — {inc.direction} shift of {inc.magnitude.toFixed(2)} on{" "}
                    {inc.periodStart}
                  </p>
                  <span
                    className={`badge ${
                      inc.status === "closed"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : inc.status === "explained"
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {inc.status}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {causes.map((c, i) => (
                    <p key={i} className="text-xs text-slate-400">
                      #{i + 1} <span className="text-slate-200">{c.factor}</span> — posterior {c.score.toFixed(3)}, evidence strength{" "}
                      {c.evidenceStrength.toFixed(2)}
                      <br />
                      <span className="italic text-slate-500">{c.testableHypothesis}</span>
                    </p>
                  ))}
                  {causes.length === 0 && <p className="text-xs text-slate-500">No candidate causes discovered for this metric yet.</p>}
                </div>
                {inc.status !== "closed" && (
                  <div className="mt-3 flex gap-2">
                    {!inc.testedHypothesis && (
                      <form action={markHypothesisTestedAction}>
                        <input type="hidden" name="id" value={inc.id} />
                        <button className="btn btn-secondary" type="submit">
                          Mark top hypothesis tested
                        </button>
                      </form>
                    )}
                    <form action={closeIncidentAction}>
                      <input type="hidden" name="id" value={inc.id} />
                      <button className="btn btn-primary" type="submit">
                        Close incident
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
