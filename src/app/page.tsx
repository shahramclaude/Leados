import { db } from "@/db";
import { sql } from "drizzle-orm";
import { listPeople } from "@/lib/db/peopleRepo";
import { listCommitments } from "@/lib/db/commitmentRepo";
import { listDelegations } from "@/lib/db/delegationRepo";
import { listDrafts } from "@/lib/db/proactiveRepo";
import { health as loopHealth } from "@/lib/db/loopRepo";
import {
  runExtractionAction,
  runDetectionCycleAction,
  seedAction,
  syncLoopsAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  const [people, commitments, delegations, drafts, loops] = await Promise.all([
    listPeople(),
    listCommitments(),
    listDelegations(),
    listDrafts(),
    loopHealth(),
  ]);

  const openCommitments = commitments.filter((c) => c.status === "open").length;
  const brokenCommitments = commitments.filter((c) => c.status === "broken").length;
  const queuedDrafts = drafts.filter((d) => d.status === "queued").length;
  const blockedDelegations = delegations.filter((d) => d.status === "blocked").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="rounded-3xl bg-white p-10 shadow-[0_24px_60px_rgba(16,24,40,0.12)]">
        <p className="m-0 text-sm uppercase tracking-[0.08em] text-slate-600">Part 48 — Proactive Workflow Architect</p>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] text-slate-950">
          Commitments, Delegation &amp; Proactive Follow-Through
        </h1>
        <p className="mt-4 max-w-3xl text-base text-slate-700">
          Every commitment is tracked end to end. Every delegation passes authority, capacity, and growth
          checks before it is trusted. Every proactive nudge is a T1 draft by default, queued respectfully
          within the interrupt budget. Every loop has a next step and an owner — or it is explicitly parked.
        </p>

        {people.length === 0 ? (
          <form action={seedAction} className="mt-6">
            <button className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Seed demo data
            </button>
          </form>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <form action={runExtractionAction}>
              <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Run extraction (Part 42 / 43 artifacts)
              </button>
            </form>
            <form action={runDetectionCycleAction}>
              <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Run proactive detection cycle
              </button>
            </form>
            <form action={syncLoopsAction}>
              <button className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                Sync loops from surfaces
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open commitments" value={openCommitments} tone={openCommitments > 0 ? "warn" : "ok"} />
        <StatCard label="Broken commitments" value={brokenCommitments} tone={brokenCommitments > 0 ? "bad" : "ok"} />
        <StatCard label="Queued proactive drafts" value={queuedDrafts} tone="info" />
        <StatCard label="Blocked delegations" value={blockedDelegations} tone={blockedDelegations > 0 ? "warn" : "ok"} />
      </section>

      <section className="mt-8 rounded-3xl bg-white p-8 shadow-[0_12px_32px_rgba(16,24,40,0.08)]">
        <h2 className="text-lg font-semibold text-slate-900">Loop health snapshot</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
          {Object.entries(loops.bySurface).map(([surface, stats]) => (
            <div key={surface} className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{surface}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.open}</p>
              <p className="text-xs text-slate-500">open · {stats.parked} parked · {stats.violations} violations</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-slate-500">
        People seeded: {people.length} — visit each view from the nav above.
      </p>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "bad" | "info" }) {
  const toneClasses: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    bad: "bg-rose-50 text-rose-700 border-rose-200",
    info: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return (
    <div className={`rounded-2xl border p-5 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
