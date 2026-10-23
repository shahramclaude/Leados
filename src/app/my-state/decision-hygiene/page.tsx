import Link from "next/link";
import { listDecisions } from "@/lib/leaderState/repository";
import { decisionWindowSuggestion } from "@/lib/leaderState/decisionLoad";
import { DEMO_SELF_ACTOR, DEMO_USER_ID } from "@/lib/leaderState/demo";
import { BoundaryBadge } from "@/components/leaderState/BoundaryBadge";
import { UncertaintyNote } from "@/components/leaderState/UncertaintyNote";
import { DecisionLogForm } from "@/components/leaderState/DecisionLogForm";

export const dynamic = "force-dynamic";

const HYGIENE_GUIDANCE: Array<{ title: string; body: string }> = [
  {
    title: "Reversible decisions",
    body: "Low cost if wrong. A reasonable default is to decide quickly and adjust later rather than researching exhaustively.",
  },
  {
    title: "Costly-to-reverse decisions",
    body: "Worth a deliberate pause — sleeping on it once, or getting one outside perspective, is often proportionate.",
  },
  {
    title: "Irreversible decisions",
    body: "These are the ones where protecting a high-capacity window (see your suggestion below) tends to matter most, " +
      "along with deliberately slowing down rather than deciding under time pressure if you can avoid it.",
  },
];

export default async function DecisionHygienePage() {
  const decisions = await listDecisions(DEMO_SELF_ACTOR, DEMO_USER_ID);
  const suggestion = decisionWindowSuggestion(decisions);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-3xl font-semibold text-slate-950">Decision Hygiene</h1>
          <BoundaryBadge />
        </div>
        <p className="m-0 text-sm text-slate-600">
          Suggestions only — none of this is enforced, scored, or visible to anyone but you.
        </p>
        <Link href="/my-state" className="text-sm text-indigo-700 underline">
          ← Back to My State
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">When to decide what</h2>
        <ul className="m-0 mt-2 list-disc space-y-2 pl-5 text-sm text-slate-700">
          {HYGIENE_GUIDANCE.map((g) => (
            <li key={g.title}>
              <strong>{g.title}:</strong> {g.body}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Your suggested window for high-stakes decisions</h2>
        <p className="m-0 mt-1 text-xs text-slate-600">{suggestion.statement}</p>
        <UncertaintyNote confidence={suggestion.confidence} sampleSize={suggestion.sampleSize} />
      </section>

      <DecisionLogForm />
    </main>
  );
}
