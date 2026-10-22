import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { chaosRuns, continuityDrills } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  const [runCountRow] = await db.select({ c: sql<number>`count(*)` }).from(chaosRuns);
  const [failedCountRow] = await db.select({ c: sql<number>`count(*)` }).from(chaosRuns).where(sql`outcome = 'failed'`);
  const [drillCountRow] = await db.select({ c: sql<number>`count(*)` }).from(continuityDrills);

  const runCount = Number(runCountRow?.c ?? 0);
  const failedCount = Number(failedCountRow?.c ?? 0);
  const drillCount = Number(drillCountRow?.c ?? 0);

  const cards = [
    {
      href: "/resilience-lab",
      title: "Resilience Lab",
      desc: "Chaos experiment calendar, steady-state dashboards, and honest pass/fail results.",
      stat: `${runCount} runs · ${failedCount} failed`,
    },
    {
      href: "/continuity-plans",
      title: "Continuity Plans",
      desc: "Critical processes, RTO/RPO, manual workaround playbooks, and tabletop drill history.",
      stat: `${drillCount} drills recorded`,
    },
    {
      href: "/degradation-status",
      title: "Degradation Status",
      desc: "What's working right now, in plain language, for end users rather than ops.",
      stat: "live",
    },
    {
      href: "/failure-domain-coverage",
      title: "Failure-Domain Coverage",
      desc: "The chaos program's own gap map — which domains have zero experiments, and why.",
      stat: "self-audit",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-[0.08em] text-slate-500">LEADOS · Part 35</p>
      <h1 className="mt-3 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-tight text-slate-950">
        Resilience &amp; Chaos Engineering
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        Structured chaos experiments, graceful degradation, operational continuity planning, and the program&apos;s
        own coverage gap map — all tied back to a living risk register.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-950">{c.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{c.desc}</p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">{c.stat}</p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-slate-500">
        Run <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run seed:resilience</code> then{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run chaos:run</code> to populate transcripts, or use
        the &quot;Run now&quot; buttons inside the Resilience Lab.
      </p>
    </main>
  );
}
