import Link from "next/link";
import { MODEL_CARDS } from "@/lib/intelligence/modelCards";

export const dynamic = "force-dynamic";

export default function ModelCardsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/intelligence" className="text-sm text-sky-700 hover:underline">
        ← Back to Intelligence briefing
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-950">Model Cards</h1>
      <p className="mt-2 text-slate-600">
        Every estimate surfaced in LEADOS links back to one of these cards: what data feeds it, what method is used,
        what it assumes, when it was last validated, and how it is known to fail.
      </p>
      <div className="mt-8 grid gap-4">
        {MODEL_CARDS.map((card) => (
          <Link
            key={card.id}
            href={`/model-cards/${card.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{card.name}</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {card.beliefType}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{card.method}</p>
            <p className="mt-2 text-xs text-slate-400">Last validated {card.lastValidated}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
