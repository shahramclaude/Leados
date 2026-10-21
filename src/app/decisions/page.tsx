import Link from "next/link";
import { listDecisions } from "@/lib/decisionEngine";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const decisions = await listDecisions();

  return (
    <main className="min-h-screen bg-slate-50 pb-20">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">← Cockpit</Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Decision Workspace</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Structured decisions with weighted criteria, EV as a distribution (p10/p50/p90 — never a single point), reversibility classification, pre-mortem prompts, and a hard gate: you cannot record a decision without acknowledging the downside case.
          </p>
        </div>
      </header>
      <div className="mx-auto mt-6 max-w-5xl space-y-3 px-6">
        {decisions.map((d) => (
          <Link key={d.id} href={`/decisions/${d.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-300">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">{d.title}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{d.status}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{d.context}</p>
            <p className="mt-2 text-xs text-slate-500">
              {d.reversibility === "one-way-door" ? "⚠ One-way door — harder to reverse" : "Two-way door — reversible"} · owner {d.ownerId}
              {d.reviewDate ? ` · review date ${d.reviewDate}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
