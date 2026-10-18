import { db } from "@/db";
import { leadosMetrics } from "@/db/schema";
import { computeCorrelations, detectAnomalies, type MetricPoint } from "@/lib/metricsEngine";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leadosMetrics).orderBy(asc(leadosMetrics.createdAt));

  const byKey = new Map<string, MetricPoint[]>();
  for (const r of rows) {
    const list = byKey.get(r.key) ?? [];
    list.push({ date: r.createdAt, value: r.value });
    byKey.set(r.key, list);
  }

  const keys = [...byKey.keys()].sort();

  const anomalies = keys.flatMap((key) =>
    detectAnomalies(byKey.get(key) ?? []).map((a) => ({ ...a, key, at: a.at.toISOString() })),
  );
  anomalies.sort((a, b) => b.severity - a.severity);

  const historyByKey: Record<string, MetricPoint[]> = {};
  for (const k of keys) historyByKey[k] = byKey.get(k) ?? [];
  const correlations = keys.length >= 2 ? computeCorrelations(keys, historyByKey) : { keys, pearson: [], spearman: [], pairs: [] };

  return Response.json({ anomalies, correlations });
}
