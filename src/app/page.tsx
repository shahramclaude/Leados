import { db } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS — Part 54</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Org Design Lab &amp; M&amp;A Deal Room
        </h1>
        <p className="mt-4 text-base text-slate-700">
          Structural-move simulation on the org twin, a mandatory human-impact ledger, an M&amp;A deal room with
          obligation cascades and synergy intervals, scenario comparison, and a post-mortem recalibration bridge.
        </p>
        <Link
          href="/org-design"
          className="mt-6 inline-block rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Open Org Design Lab →
        </Link>
      </section>
    </main>
  );
}
