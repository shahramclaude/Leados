"use client";
import type { IntelligenceData } from "@/hooks/useIntelligence";

const URGENCY_COLORS: Record<string, string> = {
  NOW: "text-red-400",
  TODAY: "text-amber-400",
  THIS_WEEK: "text-yellow-400",
};

function entropyLabel(h: number) {
  if (h < 0.2) return { label: "RIGID", color: "text-blue-400" };
  if (h > 0.8) return { label: "CHAOTIC", color: "text-red-400" };
  return { label: "HEALTHY RANGE", color: "text-emerald-400" };
}

export function IntelligenceView({ data }: { data: IntelligenceData }) {
  const { beliefs, correlations, inferences, orgEntropy, feedbackLoops } = data;
  const ent = entropyLabel(orgEntropy);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Bayesian beliefs */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Bayesian belief state</div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2 font-medium">Hypothesis</th>
                <th className="px-4 py-2 font-medium">Prior → Posterior</th>
                <th className="px-4 py-2 font-medium">Evidence</th>
                <th className="px-4 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(beliefs ?? {}).map(([key, b]: [string, any]) => (
                <tr key={key} className="border-b border-slate-800/60">
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-medium">{b.label}</div>
                    <div className="text-[10px] font-mono text-slate-600">{key}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {b.priorPct}% →{" "}
                    <span className={`font-bold ${b.highRisk ? "text-red-400" : "text-slate-200"}`}>{b.posteriorPct}%</span>
                    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${b.highRisk ? "bg-red-600 text-white" : "bg-slate-700 text-slate-300"}`}>
                      {b.highRisk ? "HIGH RISK" : "watch"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {b.appliedEvidence.length ? (
                      <ul className="space-y-0.5">
                        {b.appliedEvidence.map((e: string, i: number) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    ) : (
                      "No supporting evidence yet"
                    )}
                  </td>
                  <td className="px-4 py-3 w-40">
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${b.highRisk ? "bg-red-500" : "bg-indigo-500"}`} style={{ width: `${b.posteriorPct}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-slate-600 mt-2">Labeled: likelihood ratios from cited research. Small n.</div>
      </section>

      {/* Correlation clusters */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Correlation clusters</div>
        {correlations.length === 0 && <div className="text-sm text-slate-500">No correlated finding clusters detected.</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {correlations.map((c: any) => (
            <details key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
              <summary className="cursor-pointer flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">{c.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 ml-auto">sev {c.combinedSev}</span>
              </summary>
              <div className="text-xs text-slate-500 mt-2">{c.description}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {c.members.map((m: string) => (
                  <span key={m} className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                    {m}
                  </span>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Forward inference chains */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Forward inference chains</div>
        {inferences.length === 0 && <div className="text-sm text-slate-500">No active inference chains.</div>}
        <div className="space-y-2">
          {inferences.map((inf: any) => (
            <div key={inf.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-cyan-400">{inf.id}</span>
                <span className="text-sm text-slate-100 font-medium">{inf.title}</span>
                <span className={`text-[10px] font-mono ml-auto ${URGENCY_COLORS[inf.urgency] ?? "text-slate-500"}`}>{inf.urgency}</span>
              </div>
              <ul className="text-xs text-slate-500 mt-2 space-y-0.5">
                {inf.premises.map((p: string, i: number) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
              <div className="text-[10px] text-slate-600 mt-1">{inf.confidence}% confidence</div>
            </div>
          ))}
        </div>
      </section>

      {/* Org entropy */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Organizational entropy</div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-5 py-4 flex items-center gap-6">
          <div className="text-4xl font-bold font-mono text-slate-100">{orgEntropy.toFixed(2)}</div>
          <div>
            <div className={`text-sm font-semibold ${ent.color}`}>{ent.label}</div>
            <div className="text-xs text-slate-500">H = {(orgEntropy * 100).toFixed(0)}% normalized. Below 0.2 = rigid, above 0.8 = chaotic.</div>
          </div>
        </div>
      </section>

      {/* Feedback loops */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Feedback loops</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {feedbackLoops.map((loop: any) => (
            <div key={loop.id} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span
                className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                  loop.polarity === "REINFORCING" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
                }`}
              >
                {loop.polarity}
              </span>
              <span className="text-sm text-slate-200">{loop.name}</span>
              <span className={`ml-auto text-[10px] font-mono ${loop.active ? "text-emerald-400" : "text-slate-600"}`}>
                {loop.active ? "ACTIVE" : "inactive"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Emergent signals */}
      <section>
        <div className="text-sm font-semibold text-slate-300 mb-2">Emergent signals</div>
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-xl px-5 py-6 text-center text-xs text-slate-600">
          Frequency anomaly detection — add events to activate.
        </div>
      </section>
    </div>
  );
}
