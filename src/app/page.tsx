import { db } from "@/db";
import { crises, crisisClasses } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATE_COLORS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800",
  elevated: "bg-amber-100 text-amber-800",
  crisis: "bg-red-100 text-red-800",
  recovery: "bg-sky-100 text-sky-800",
  post_mortem: "bg-violet-100 text-violet-800",
  closed: "bg-slate-200 text-slate-700",
};

export default async function HomePage() {
  const rows = await db
    .select({ crisis: crises, klass: crisisClasses })
    .from(crises)
    .innerJoin(crisisClasses, eq(crises.classId, crisisClasses.id))
    .orderBy(desc(crises.createdAt))
    .limit(10);

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">LEADOS · Part 47</p>
        <h1 className="mt-2 text-[clamp(1.75rem,4vw,2.75rem)] font-semibold text-slate-950">Crisis Command &amp; Continuity</h1>
        <p className="mt-3 max-w-2xl text-slate-700">
          Declare and run crises through a disciplined state machine, with a pre-configured command structure,
          time-boxed decisions with assumption registers, double-source-enforced comms, and a public status page.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/crisis/declare" className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white shadow hover:bg-red-700">
            Declare a Crisis
          </Link>
          <Link href="/crisis" className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 shadow hover:bg-slate-50">
            Crisis List
          </Link>
          <Link href="/status" className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 shadow hover:bg-slate-50">
            Public Status Page
          </Link>
          <Link href="/drills" className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 shadow hover:bg-slate-50">
            Drill Runner
          </Link>
        </div>

        <section className="mt-10 rounded-2xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-slate-900">Recent crises</h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No crises recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {rows.map(({ crisis, klass }) => (
                <li key={crisis.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link href={`/crisis/${crisis.id}`} className="font-medium text-slate-900 hover:underline">
                      {crisis.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {klass.name} · severity {crisis.severity} {crisis.isDrill ? "· DRILL" : ""}
                    </p>
                  </div>
                  <span className={`crisis-badge rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATE_COLORS[crisis.state]}`}>
                    {crisis.state}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
