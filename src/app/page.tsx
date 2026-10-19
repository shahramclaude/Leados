import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/strategic",
    title: "Strategic Intelligence",
    description:
      "Auto-triggered scenarios, wargame alerts, real-options decision valuation, and OKR health in one report.",
  },
  {
    href: "/decision-trees",
    title: "Decision Trees",
    description: "Branch open decisions into decide-now vs. wait using the real-options model.",
  },
  {
    href: "/inference",
    title: "Inference",
    description: "Bayesian hypothesis tracking that updates posteriors as new events arrive.",
  },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Leados</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Strategic Intelligence Layer
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Scenario monitoring, wargaming, real-options valuation, Monte Carlo outcome distributions and OKR health —
          wired into a single orchestrator pipeline.
        </p>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-400 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-950">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
