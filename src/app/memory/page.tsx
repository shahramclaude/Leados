import { listTimeline, recallOnThisDay, memorySummaryByCategory } from "@/lib/institutionalMemory";
import MemoryForm from "./MemoryForm";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const [timeline, onThisDay, summary] = await Promise.all([listTimeline(50), recallOnThisDay(), memorySummaryByCategory()]);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-semibold text-slate-950">Institutional Memory</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Every significant outcome becomes a structured retrospective: situation → decision → outcome → lesson. Confidence
          strengthens with repeated evidence and decays over time toward a floor — nothing is ever deleted.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <div key={s.valence} className="rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
            <div className="text-xs uppercase tracking-wide text-slate-500">{s.valence}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{s.count}</div>
            <div className="text-xs text-slate-500">avg confidence {(s.avgConfidence * 100).toFixed(0)}%</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Record a retrospective</h2>
        <div className="mt-4">
          <MemoryForm />
        </div>
      </section>

      {onThisDay.length > 0 && (
        <section className="rounded-2xl bg-amber-50 p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
          <h2 className="text-lg font-semibold text-slate-950">On this day</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {onThisDay.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.title}</span> — {r.lesson}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-950">Timeline</h2>
        <ul className="mt-4 flex flex-col gap-4">
          {timeline.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-950">{r.title}</h3>
                <span className="text-xs text-slate-500">{r.occurredAt}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">
                <strong>Situation:</strong> {r.situation}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <strong>Decision:</strong> {r.decision}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <strong>Outcome:</strong> {r.outcome}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                <strong>Lesson:</strong> {r.lesson}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase">{r.outcomeValence}</span>
                <span>confidence: {(r.currentConfidence * 100).toFixed(0)}% (base {(r.baseConfidence * 100).toFixed(0)}%, {r.evidenceCount} reinforcement{r.evidenceCount === 1 ? "" : "s"})</span>
                {r.tags.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">
                    #{t}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {timeline.length === 0 && <li className="text-sm text-slate-500">No retrospectives recorded yet.</li>}
        </ul>
      </section>
    </main>
  );
}
