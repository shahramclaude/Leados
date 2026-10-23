import Link from "next/link";
import { getWisdomDashboard } from "@/lib/collective/service";
import { RecomputeWisdomButton } from "../_components/RecomputeWisdomButton";

export const dynamic = "force-dynamic";

const WINNER_STYLE: Record<string, string> = {
  crowd: "bg-indigo-100 text-indigo-800",
  model: "bg-sky-100 text-sky-800",
  market: "bg-emerald-100 text-emerald-800",
  tie: "bg-slate-200 text-slate-700",
};

export default async function WisdomDashboardPage() {
  const stats = await getWisdomDashboard();

  const latestByClass = new Map<string, (typeof stats)[number]>();
  for (const s of stats) {
    if (!latestByClass.has(s.questionClass)) latestByClass.set(s.questionClass, s);
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link href="/collective" className="text-xs text-slate-500 underline underline-offset-4">
        ← Registered questions
      </Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold text-slate-950">Wisdom Dashboard</h1>
        <RecomputeWisdomButton />
      </div>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Crowd-vs-model-vs-market Brier scores per question class, tracked over time, so the product learns where its
        crowd is actually wise — and where it should defer to the model instead.
      </p>

      {latestByClass.size === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No resolved questions yet. Resolve a question from its Collective View page, then recompute.
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl bg-white shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Question class</th>
                <th className="px-4 py-3">Crowd Brier</th>
                <th className="px-4 py-3">Model Brier</th>
                <th className="px-4 py-3">Market Brier</th>
                <th className="px-4 py-3">Diversity index</th>
                <th className="px-4 py-3">n</th>
                <th className="px-4 py-3">Winner</th>
              </tr>
            </thead>
            <tbody>
              {[...latestByClass.values()].map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-950">{s.questionClass}</td>
                  <td className="px-4 py-3 font-mono">{Number(s.crowdBrier).toFixed(4)}</td>
                  <td className="px-4 py-3 font-mono">{Number(s.modelBrier).toFixed(4)}</td>
                  <td className="px-4 py-3 font-mono">{s.marketBrier !== null ? Number(s.marketBrier).toFixed(4) : "—"}</td>
                  <td className="px-4 py-3 font-mono">{Number(s.diversityIndex).toFixed(3)}</td>
                  <td className="px-4 py-3">{s.sampleSize}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${WINNER_STYLE[s.winner] ?? ""}`}>
                      {s.winner}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Lower Brier score is better. A low diversity index alongside high crowd confidence is a groupthink warning
        sign, not evidence of wisdom (see AI-SESSION-LOG.md PHASE 5 attack review).
      </p>
    </main>
  );
}
