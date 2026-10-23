import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS — Part 51</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Recommendation &amp; Intervention Marketplace
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Evidence-backed, explainable management recommendations — ranked with diversity and serendipity
          constraints, never padded with noise.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="/action-desk"
            className="rounded-xl bg-slate-900 px-5 py-3 text-center text-sm font-medium text-white hover:bg-slate-700"
          >
            Open Action Desk
          </a>
          <a
            href="/intervention-library"
            className="rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Browse Intervention Library
          </a>
          <a
            href="/impact-history"
            className="rounded-xl border border-slate-300 px-5 py-3 text-center text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            View Impact History
          </a>
        </div>
      </section>
    </main>
  );
}
