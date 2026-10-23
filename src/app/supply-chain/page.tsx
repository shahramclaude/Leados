import { db } from "@/db";
import * as s from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, Badge } from "@/components/Shell";
import { mean, stddev } from "@/lib/calculations";

export const dynamic = "force-dynamic";

export default async function SupplyChainPage() {
  const items = await db.select().from(s.inventoryItems);
  const forecasts = await db.select().from(s.demandForecasts).orderBy(desc(s.demandForecasts.createdAt));
  const checks = await db.select().from(s.qualityChecks).orderBy(desc(s.qualityChecks.checkedAt));

  const violations = checks.filter((c) => c.violation).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-600">Part 94</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Supply Chain &amp; Operations Execution</h1>
        <p className="mt-1 text-sm text-slate-600">
          Safety-stock sizing from lead-time demand quantiles, moving-average demand forecasts, and SPC quality
          control (center line + upper/lower limits computed, not guessed).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="SKUs tracked"><p className="text-2xl font-semibold">{items.length}</p></Card>
        <Card title="SPC violations"><p className="text-2xl font-semibold text-rose-600">{violations}</p></Card>
        <Card title="Items below reorder point">
          <p className="text-2xl font-semibold text-amber-600">{items.filter((i) => i.onHand <= i.reorderPoint).length}</p>
        </Card>
      </div>

      <Card title="Inventory policy (s,S) &amp; demand forecast">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">SKU</th><th>Pattern</th><th>On hand</th><th>Reorder pt (s)</th><th>Order-up-to (S)</th><th>Lead time</th><th>Forecast P50 / P90</th><th>Bias</th></tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const fc = forecasts.find((f) => f.itemId === it.id);
              const hist = it.demandHistory as number[];
              const sd = stddev(hist);
              const m = mean(hist);
              return (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="py-1.5">{it.sku}<div className="text-xs text-slate-400">{it.name}</div></td>
                  <td><Badge tone={it.pattern === "intermittent" ? "amber" : it.pattern === "seasonal" ? "indigo" : "slate"}>{it.pattern}</Badge></td>
                  <td className={it.onHand <= it.reorderPoint ? "font-semibold text-amber-600" : ""}>{it.onHand}</td>
                  <td>{it.reorderPoint}</td>
                  <td>{it.orderUpTo}</td>
                  <td>{it.leadTimeDays}d</td>
                  <td>{fc ? `${Number(fc.p50).toFixed(1)} / ${Number(fc.p90).toFixed(1)}` : "—"}</td>
                  <td>{fc ? `${Number(fc.biasPct).toFixed(1)}%` : "—"}</td>
                  <td className="text-xs text-slate-400">mean {m.toFixed(1)}, sd {sd.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="SPC quality chart log (Western Electric: beyond-3-sigma rule applied)">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400">
            <tr><th className="py-1.5">Line</th><th>Metric</th><th>Value</th><th>Center line</th><th>Limits</th><th>Status</th></tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-1.5">{c.line}</td>
                <td>{c.metric}</td>
                <td>{Number(c.value).toFixed(2)}</td>
                <td>{Number(c.centerLine).toFixed(2)}</td>
                <td>[{Number(c.lowerLimit).toFixed(2)}, {Number(c.upperLimit).toFixed(2)}]</td>
                <td>{c.violation ? <Badge tone="red">beyond-3-sigma</Badge> : <Badge tone="green">in control</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
