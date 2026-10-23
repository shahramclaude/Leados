import { db } from "@/db";
import { clauses, contracts, documents, parties } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

async function getDocuments() {
  return db
    .select({
      id: documents.id,
      title: documents.title,
      sourceType: documents.sourceType,
      quarantineStatus: documents.quarantineStatus,
      ocrStatus: documents.ocrStatus,
      uploadedAt: documents.uploadedAt,
      counterpartyName: parties.name,
      clauseCount: sql<number>`count(${clauses.id})`.mapWith(Number),
      confirmedCount: sql<number>`count(${clauses.id}) filter (where ${clauses.status} = 'confirmed')`.mapWith(
        Number,
      ),
    })
    .from(documents)
    .leftJoin(contracts, eq(contracts.documentId, documents.id))
    .leftJoin(parties, eq(parties.id, contracts.counterpartyPartyId))
    .leftJoin(clauses, eq(clauses.documentId, documents.id))
    .groupBy(documents.id, parties.name)
    .orderBy(documents.uploadedAt);
}

export default async function VaultPage() {
  const docs = await getDocuments();

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Contract Vault</h2>
        <p className="mt-1 text-sm text-slate-600">
          Every document below passed Part 34&apos;s quarantine/OCR seam before extraction ran.
          &quot;Reviewed&quot; here only ever means &quot;extracted clauses confirmed by a human&quot; —
          it is never a claim that the full document, or the full portfolio, has been legally reviewed.
          See the Attack-phase note in AI-SESSION-LOG.md on avoiding false security.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Document</th>
              <th className="px-4 py-3">Counterparty</th>
              <th className="px-4 py-3">Quarantine</th>
              <th className="px-4 py-3">OCR</th>
              <th className="px-4 py-3">Clauses (confirmed / total)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{d.title}</td>
                <td className="px-4 py-3 text-slate-600">{d.counterpartyName ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.quarantineStatus} />
                </td>
                <td className="px-4 py-3 text-slate-600">{d.ocrStatus.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-slate-600">
                  {d.confirmedCount} / {d.clauseCount}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link className="text-blue-700 underline" href={`/legal/vault/${d.id}`}>
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                  No documents yet. Run <code>npm run seed:legal</code> to load the demo portfolio.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
