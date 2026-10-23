import Link from "next/link";
import { listQuestions } from "@/lib/collective/service";
import { SeedButton } from "./_components/SeedButton";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-100 text-sky-800",
  delphi: "bg-violet-100 text-violet-800",
  market: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-800",
  void: "bg-slate-200 text-slate-600",
};

export default async function CollectivePage() {
  const questions = await listQuestions();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Part 44 · Collective Intelligence</p>
          <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold leading-tight text-slate-950">
            Registered Questions
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-600">
            Judgment aggregation, Delphi rounds, and an internal LMSR prediction market for every registered
            question. Minority reports are always shown next to the aggregate — never averaged away.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Link
            href="/collective/wisdom"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-slate-500"
          >
            Wisdom Dashboard →
          </Link>
          <SeedButton />
        </div>
      </header>

      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          No registered questions yet. Click &ldquo;Seed demo data&rdquo; to populate forecasts, a two-round Delphi
          panel, and a market floor (including a seeded manipulation attempt caught by the integrity guards).
        </div>
      ) : (
        <ul className="grid gap-4">
          {questions.map((q) => (
            <li key={q.id} className="rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[q.status] ?? "bg-slate-100 text-slate-700"}`}>
                  {q.status}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-400">{q.questionClass}</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-slate-950">{q.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{q.description}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
                <Link href={`/collective/${q.id}`} className="text-slate-950 underline underline-offset-4">
                  Collective View
                </Link>
                <Link href={`/collective/${q.id}/delphi`} className="text-slate-950 underline underline-offset-4">
                  Delphi Workspace
                </Link>
                <Link href={`/collective/${q.id}/market`} className="text-slate-950 underline underline-offset-4">
                  Market Floor
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
