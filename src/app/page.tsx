import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Deliberately the lightest route in the app (the "shell" budget in
 * perf-budgets.json: <= 150KB gzip initial JS). It does one cheap `select 1`
 * health check and renders a single link — no charts, no client panels, no
 * dynamic imports — so it is the cheapest possible baseline against which
 * the heavier /cockpit route's budget is measured.
 */
export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Performance-hardened cockpit
        </h1>
        <p className="mt-4 text-base text-slate-700">
          This shell route stays minimal on purpose. The dashboard, with its forecast simulation,
          org network, activity heatmap and virtualized people table, lives at{" "}
          <Link href="/cockpit" className="font-medium text-indigo-600 underline">
            /cockpit
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
