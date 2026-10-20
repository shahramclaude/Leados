import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";
import { countEvents } from "@/lib/platform/db/eventsRepository";
import { countFindings } from "@/lib/platform/db/findingsRepository";
import { countDecisions } from "@/lib/platform/db/decisionsRepository";
import { countRuns } from "@/lib/platform/db/runsRepository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let dbOk = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbOk = false;
  }

  const [events, findingsTotal, decisionsTotal, runsTotal] = await Promise.all([
    countEvents(),
    countFindings(),
    countDecisions(),
    countRuns(),
  ]);

  const cards = [
    { href: "/onboarding", label: "Onboarding", value: "Start here" },
    { href: "/events", label: "Events logged", value: events },
    { href: "/findings", label: "Findings", value: findingsTotal },
    { href: "/decisions", label: "Decisions", value: decisionsTotal },
    { href: "/automation", label: "Automation runs", value: runsTotal },
    { href: "/boardpack", label: "Board Pack", value: "Export" },
  ];

  return (
    <div className="space-y-10">
      <section
        className="ld-surface rounded-3xl border p-10 shadow-sm"
        data-testid="system-status"
      >
        <p className="m-0 text-sm uppercase tracking-[0.08em]" style={{ color: "var(--muted)" }}>
          System Status
        </p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05]">
          LEADOS
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--muted)" }}>
          Autonomous leadership-intelligence operating system. Database:{" "}
          <span data-testid="db-status" className={dbOk ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
            {dbOk ? "connected" : "unreachable"}
          </span>
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="ld-surface rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{card.value}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
