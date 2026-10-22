import Link from "next/link";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 25</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Operating Rhythm Engine
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Cadence graph, agenda synthesis, adaptive cadence policy, after-ritual capture, and ritual
          effectiveness — server-rendered with Next.js over PostgreSQL via Drizzle.
        </p>
        <Link
          href="/cadence"
          className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open the Rhythm Board →
        </Link>
      </section>
    </main>
  );
}
