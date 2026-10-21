import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 01</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Event-sourced data core
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Immutable, hash-chained, bi-temporal event log. Rebuildable projections for OrgUnits, People, Roles,
          Skills, Objectives, Key Results, Decisions, Findings, Hypotheses, Risks, Initiatives, Budgets/Accounts/
          Transactions, and Policies. Outbox-driven projector, optimistic concurrency, idempotent writes, and
          deterministic seeding.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/admin/events" className="rounded-lg bg-slate-950 px-4 py-2 font-medium text-white hover:bg-slate-800">
            Event log browser
          </Link>
          <Link href="/admin/health" className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-800 hover:bg-slate-50">
            Platform health
          </Link>
          <Link href="/api/health" className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-800 hover:bg-slate-50">
            /api/health
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Seed a deterministic org world with <code>npm run seed -- --size=small</code>, then rebuild projections
          from empty with <code>npm run db:rebuild</code>.
        </p>
      </section>
    </main>
  );
}
