import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SURFACES = [
  { href: "/group-consolidation", title: "Group Consolidation", desc: "Rollup tree, elimination transparency, FX method badges." },
  { href: "/entity-compare", title: "Entity Compare", desc: "Every entity, local & group currency, side by side." },
  { href: "/fiscal-calendar", title: "Fiscal Calendar Matrix", desc: "Per-entity calendars and the period-alignment engine." },
  { href: "/jurisdiction", title: "Jurisdiction View", desc: "Obligations + live data-residency enforcement." },
  { href: "/board-pack", title: "Board Pack", desc: "Group totals, always next to entity-level notes." },
];

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="min-h-screen px-6 py-12">
      <section className="mx-auto w-full max-w-3xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 37</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Global Operations
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Entity hierarchy, multi-currency consolidation, per-entity fiscal calendars, and jurisdiction/residency
          enforcement — all with entity-level drill-down preserved on every total.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {SURFACES.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-2xl border border-slate-200 p-4 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <p className="font-semibold text-slate-950">{s.title}</p>
              <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
