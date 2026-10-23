import { db } from "@/db";
import { clauses, contracts, obligations, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeRenewalWindow } from "@/lib/legal/dates";
import { daysUntil } from "@/lib/legal/cadenceSeam";
import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getCalendar() {
  const allContracts = await db
    .select({
      id: contracts.id,
      title: contracts.title,
      effectiveDate: contracts.effectiveDate,
      termMonths: contracts.termMonths,
      renewalWindowDays: contracts.renewalWindowDays,
      terminationNoticeDays: contracts.terminationNoticeDays,
      status: contracts.status,
      documentId: contracts.documentId,
      counterpartyName: parties.name,
    })
    .from(contracts)
    .leftJoin(parties, eq(parties.id, contracts.counterpartyPartyId));

  const now = new Date();

  const rows = await Promise.all(
    allContracts.map(async (c) => {
      const window = computeRenewalWindow({
        effectiveDate: c.effectiveDate,
        termMonths: c.termMonths,
        renewalWindowDays: c.renewalWindowDays,
        terminationNoticeDays: c.terminationNoticeDays,
      });
      const contractClauses = await db.select().from(clauses).where(eq(clauses.contractId, c.id));
      const confirmedClauses = contractClauses.filter((cl) => cl.status === "confirmed");
      const hasChangeOfControl = confirmedClauses.some((cl) => cl.clauseType === "change_of_control");
      const contractObligations = await db.select().from(obligations).where(eq(obligations.contractId, c.id));
      const openObligations = contractObligations.filter((o) => o.status === "active" || o.status === "confirmed");

      return {
        ...c,
        termEndDate: window.termEndDate,
        noticeDeadline: window.noticeDeadline,
        windowOpensAt: window.windowOpensAt,
        daysUntilNoticeDeadline: daysUntil(now, window.noticeDeadline),
        confirmedClauseCount: confirmedClauses.length,
        draftClauseCount: contractClauses.length - confirmedClauses.length,
        openObligationCount: openObligations.length,
        hasChangeOfControl,
      };
    }),
  );

  rows.sort((a, b) => a.noticeDeadline.getTime() - b.noticeDeadline.getTime());
  return rows;
}

export default async function CalendarPage() {
  const rows = await getCalendar();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Renewal Calendar</h2>
        <p className="mt-1 text-sm text-slate-600">
          Each row runs an impact analysis before the renewal/termination window: confirmed clause
          coverage, open obligations, and change-of-control exposure. Dates are computed on the UTC
          calendar day (DST-safe) — see <code>src/lib/legal/dates.ts</code>.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Term ends</th>
              <th className="px-4 py-3">Notice deadline</th>
              <th className="px-4 py-3">Days remaining</th>
              <th className="px-4 py-3">Impact analysis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.counterpartyName}</p>
                  <Link href={`/legal/vault/${r.documentId}`} className="text-xs text-blue-700 underline">
                    View document →
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.termEndDate.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-slate-600">{r.noticeDeadline.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={r.daysUntilNoticeDeadline <= 30 ? "high" : r.daysUntilNoticeDeadline <= 90 ? "medium" : "low"}
                  />
                  <span className="ml-2 text-slate-600">{r.daysUntilNoticeDeadline}d</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <p>
                    {r.confirmedClauseCount} confirmed / {r.draftClauseCount} draft clause(s) ·{" "}
                    {r.openObligationCount} open obligation(s)
                  </p>
                  {r.hasChangeOfControl && (
                    <p className="mt-1 font-medium text-rose-700">Change-of-control exposure confirmed</p>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  No contracts yet. Run <code>npm run seed:legal</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
