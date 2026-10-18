import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LeadOS</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          People Intelligence Module
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Predictive talent profiles, 9-box grids, succession pipelines and a live force-directed org network —
          computed from your own event log.
        </p>
        <Link
          href="/people"
          className="mt-6 inline-flex items-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Open People Intelligence →
        </Link>
      </section>
    </main>
  );
}
