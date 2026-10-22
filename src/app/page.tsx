import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-[80vh] place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 20</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          SRE &amp; Operability Console
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Structured telemetry, a composite health model, maintenance mode, and an end-to-end trace
          viewer — built against a real PostgreSQL-backed work queue, agent-run ledger, and
          hash-chained audit log.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/health" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            View system health
          </Link>
          <Link href="/trace" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900">
            Trace viewer
          </Link>
        </div>
      </section>
    </main>
  );
}
