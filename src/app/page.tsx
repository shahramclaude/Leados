import Link from "next/link";
import { db } from "@/db";
import { entities, relations, retrospectives, hypotheses, playbooks, livingDocs } from "@/db/schema";
import { computeGenome } from "@/lib/genome";

export const dynamic = "force-dynamic";

async function getCounts() {
  const [e, r, retro, hyp, pb, docs] = await Promise.all([
    db.select().from(entities),
    db.select().from(relations),
    db.select().from(retrospectives),
    db.select().from(hypotheses),
    db.select().from(playbooks),
    db.select().from(livingDocs),
  ]);
  return {
    entities: e.length,
    relations: r.length,
    retrospectives: retro.length,
    hypotheses: hyp.length,
    openHypotheses: hyp.filter((h) => h.status === "open").length,
    playbooks: pb.length,
    activePlaybooks: pb.filter((p) => p.status === "active" || p.status === "draft").length,
    docs: docs.length,
  };
}

const CARDS = [
  { href: "/knowledge", title: "Knowledge Graph", desc: "Entities, typed relations, neighbors, shortest influence path, blast radius, orphans." },
  { href: "/memory", title: "Institutional Memory", desc: "Situation → decision → outcome → lesson, with decaying confidence and 'on this day' recall." },
  { href: "/hypotheses", title: "Hypotheses", desc: "Open bets, Bayesian evidence accumulation, resolution, and Brier-scored forecasters." },
  { href: "/playbooks", title: "Playbooks", desc: "Executable checklists mined from retrospectives, invocable, versioned, measured." },
  { href: "/search", title: "Search", desc: "Keyword + fuzzy + graph-rank + recency across everything, with facets." },
  { href: "/docs", title: "Whitepaper", desc: "A living document that renders itself from current metrics and findings." },
];

export default async function HomePage() {
  const counts = await getCounts();
  const genome = await computeGenome();

  return (
    <main className="flex flex-col gap-10">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Part 7 — The Learning Loop</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          An organization that remembers everything
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700">
          Every decision becomes institutional memory. Every bet is tracked and scored. Every lesson can become a
          playbook. Every entity and relation is queryable, every document renders from live data, and everything
          is searchable in one place.
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Entities" value={counts.entities} />
          <Stat label="Relations" value={counts.relations} />
          <Stat label="Retrospectives" value={counts.retrospectives} />
          <Stat label="Open hypotheses" value={counts.openHypotheses} />
          <Stat label="Playbooks" value={counts.playbooks} />
          <Stat label="Living docs" value={counts.docs} />
          <Stat label="Decisions / mo" value={genome.decisionVelocityPerMonth.toFixed(1)} />
          <Stat label="Playbook adoption" value={`${(genome.playbookAdoptionRate * 100).toFixed(0)}%`} />
        </dl>
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col gap-2 rounded-2xl bg-white p-6 shadow-[0_12px_30px_rgba(16,24,40,0.08)] transition-transform hover:-translate-y-0.5"
          >
            <h2 className="text-lg font-semibold text-slate-950">{card.title}</h2>
            <p className="text-sm text-slate-600">{card.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
