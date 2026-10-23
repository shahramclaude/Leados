import { db } from "@/db";
import { clauses, contracts, obligations, parties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ObligationRow, type ObligationRowData } from "@/components/legal/ObligationRow";

export const dynamic = "force-dynamic";

const ownerParty = alias(parties, "owner_party");

async function getObligations(): Promise<ObligationRowData[]> {
  const rows = await db
    .select({
      id: obligations.id,
      description: obligations.description,
      status: obligations.status,
      severity: obligations.severity,
      dueDate: obligations.dueDate,
      cadence: obligations.cadence,
      clauseId: obligations.clauseId,
      clauseType: clauses.clauseType,
      clauseStatus: clauses.status,
      documentId: clauses.documentId,
      contractTitle: contracts.title,
      ownerName: ownerParty.name,
    })
    .from(obligations)
    .innerJoin(clauses, eq(clauses.id, obligations.clauseId))
    .innerJoin(contracts, eq(contracts.id, obligations.contractId))
    .leftJoin(ownerParty, eq(ownerParty.id, obligations.ownerPartyId));

  return rows
    .map((r) => ({ ...r, dueDate: r.dueDate ? r.dueDate.toISOString() : null }))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
}

export default async function ObligationBoardPage() {
  const rows = await getObligations();
  const byOwner = new Map<string, ObligationRowData[]>();
  for (const r of rows) {
    const key = r.ownerName ?? "Unassigned";
    byOwner.set(key, [...(byOwner.get(key) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Obligation Board</h2>
        <p className="mt-1 text-sm text-slate-600">
          Owner-facing, deadline-driven. Obligations generated from a clause stay in <code>draft</code>{" "}
          until an owner confirms them, and only reach <code>active</code> after an explicit commit — the
          source clause must also be human-confirmed (enforced server-side, not just in this UI).
        </p>
      </section>

      {Array.from(byOwner.entries()).map(([owner, items]) => (
        <section key={owner} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
            {owner} ({items.length})
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Obligation</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Due / Cadence</th>
                <th className="px-4 py-2">Severity</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <ObligationRow key={r.id} data={r} />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {rows.length === 0 && (
        <p className="text-sm text-slate-500">
          No obligations yet. Confirm clauses in the Contract Vault to generate them.
        </p>
      )}
    </div>
  );
}
