import { db } from "@/db";
import { complianceMappings } from "@/db/schema";
import { CLAUSE_TYPE_LABELS, type ClauseType } from "@/lib/legal/clauseTypes";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const rows = await db.select().from(complianceMappings);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Compliance Mapping</h2>
        <p className="mt-1 text-sm text-slate-600">
          Clause type → regulatory obligation. Every row is a documented, human judgment call (not an
          automated legal determination) and remains revisable — see{" "}
          <code>src/lib/legal/complianceMapping.ts</code>.
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Clause type</th>
              <th className="px-4 py-3">Jurisdiction</th>
              <th className="px-4 py-3">Regulatory obligation</th>
              <th className="px-4 py-3">Provenance</th>
              <th className="px-4 py-3">Revisable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {CLAUSE_TYPE_LABELS[r.clauseType as ClauseType] ?? r.clauseType}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.jurisdiction}</td>
                <td className="px-4 py-3 text-slate-700">{r.regulatoryObligation}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.provenanceNote} (by {r.documentedBy}, updated {r.updatedAt.toISOString().slice(0, 10)})
                </td>
                <td className="px-4 py-3 text-slate-600">{r.revisable ? "Yes" : "No"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                  No mapping rows yet. Run <code>npm run seed:legal</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
