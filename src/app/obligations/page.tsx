import { GrcNav } from "@/components/GrcNav";
import { db } from "@/db";
import { obligations, obligationInstances } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { RunDeadlineSweepButton, RecordEvidenceButton } from "@/components/obligations/ObligationActions";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, string> = {
  pending: "bg-slate-200 text-slate-700",
  overdue: "bg-amber-100 text-amber-800",
  breached: "bg-red-100 text-red-800",
  evidenced: "bg-emerald-100 text-emerald-800",
};

export default async function ObligationCalendarPage() {
  const obRows = await db.select().from(obligations);
  const data = [];
  for (const ob of obRows) {
    const instances = await db
      .select()
      .from(obligationInstances)
      .where(eq(obligationInstances.obligationId, ob.id))
      .orderBy(asc(obligationInstances.dueAt));
    data.push({ obligation: ob, instances });
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <GrcNav active="/obligations" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-slate-950">Obligation Calendar</h1>
        <RunDeadlineSweepButton />
      </div>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Deadlines are computed in each obligation's own IANA time zone using wall-clock day-of-month
        resolution (DST-safe) — see <code>src/lib/obligations.ts</code>. Escalation ladder: pending → (T-7
        reminder) → overdue (past due) → breached (past due + 3-day grace, raises a Finding).
      </p>

      <div className="mt-6 space-y-6">
        {data.map(({ obligation, instances }) => (
          <section key={obligation.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {obligation.code} · {obligation.source} · owner: {obligation.owner} · timezone: {obligation.timezone}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">{obligation.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{obligation.description}</p>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1">Period</th>
                  <th className="py-1">Due at (local)</th>
                  <th className="py-1">Escalation</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => (
                  <tr key={inst.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{inst.periodLabel}</td>
                    <td className="py-2">
                      {new Date(inst.dueAt).toLocaleString("en-GB", { timeZone: obligation.timezone, dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="py-2">{inst.escalationLevel}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge[inst.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {inst.status === "evidenced" ? (
                        <span className="text-xs text-slate-500">audit event #{inst.evidenceAuditEventId}</span>
                      ) : (
                        <RecordEvidenceButton instanceId={inst.id} />
                      )}
                    </td>
                  </tr>
                ))}
                {instances.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-xs text-slate-400">
                      No upcoming instances materialized yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </main>
  );
}
