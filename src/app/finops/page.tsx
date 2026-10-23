import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, Badge, HonestyBadge } from "@/components/Shell";
import { zScoreAnomaly } from "@/lib/calculations";

export const dynamic = "force-dynamic";

export default async function FinOpsPage() {
  const records = await db.select().from(s.costRecords).orderBy(desc(s.costRecords.recordedAt));

  const byFeature = new Map<string, number>();
  const byDimension = new Map<string, number>();
  let unattributed = 0;
  for (const r of records) {
    const amt = Number(r.amountUsd);
    byFeature.set(r.feature, (byFeature.get(r.feature) ?? 0) + amt);
    byDimension.set(r.dimension, (byDimension.get(r.dimension) ?? 0) + amt);
    if (!r.feature) unattributed += amt;
  }
  const total = records.reduce((a, r) => a + Number(r.amountUsd), 0);
  const attributionCompletePct = records.length ? ((records.length - records.filter((r) => !r.feature).length) / records.length) * 100 : 100;

  const amounts = records.map((r) => Number(r.amountUsd));
  const latestAnomaly = amounts.length > 2 ? zScoreAnomaly(amounts.slice(0, -1), amounts[amounts.length - 1]) : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 103</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">FinOps &amp; LLM Cost Governance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every cost record carries mandatory feature attribution. Anomaly detection uses a disclosed z-score
          formula against trailing spend.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Total tracked spend"><p className="text-2xl font-semibold">${total.toFixed(2)}</p></Card>
        <Card title="Attribution completeness">
          <p className="text-2xl font-semibold">{attributionCompletePct.toFixed(0)}%</p>
          <p className="mt-1"><HonestyBadge label="measured" /></p>
        </Card>
        <Card title="Unattributed spend"><p className="text-2xl font-semibold text-rose-600">${unattributed.toFixed(2)}</p></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Spend by dimension">
          <ul className="space-y-1 text-sm">
            {[...byDimension.entries()].map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span>${v.toFixed(2)}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Spend by feature (unit economics)">
          <ul className="space-y-1 text-sm">
            {[...byFeature.entries()].map(([k, v]) => (
              <li key={k} className="flex justify-between"><span>{k}</span><span>${v.toFixed(2)}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      {latestAnomaly && (
        <Card title="Latest spend anomaly check (z-score vs trailing records)">
          <p className="text-sm">
            z = {latestAnomaly.z}, expected ≈ ${latestAnomaly.expected} &mdash;{" "}
            {latestAnomaly.isAnomaly ? <Badge tone="red">anomaly</Badge> : <Badge tone="green">normal</Badge>}
          </p>
        </Card>
      )}

      <Card title={`Cost ledger (${records.length} records)`}>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Dimension</th><th>Resource</th><th>Feature</th><th>Amount</th><th>Recorded</th></tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5"><Badge tone="slate">{r.dimension}</Badge></td>
                <td>{r.resource}</td>
                <td>{r.feature || <span className="text-rose-500">unattributed</span>}</td>
                <td>${Number(r.amountUsd).toFixed(4)}</td>
                <td className="text-xs text-slate-400">{new Date(r.recordedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
