import { db } from "@/db";
import { fitnessMetricSamples, goodhartAlerts } from "@/db/schema";
import { analyzeGoodhartPair } from "@/lib/fitness/goodhart";
import { METRICS, getMetric } from "@/lib/fitness/dimensions";
import { asc, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function latestTwoPeriods(): Promise<[string, string] | null> {
  const rows = await db
    .selectDistinct({ periodEnd: fitnessMetricSamples.periodEnd })
    .from(fitnessMetricSamples)
    .orderBy(desc(fitnessMetricSamples.periodEnd))
    .limit(2);
  if (rows.length < 2) return null;
  return [rows[1].periodEnd, rows[0].periodEnd]; // [previous, current]
}

async function valuesForPeriod(periodEnd: string): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(fitnessMetricSamples)
    .where(eq(fitnessMetricSamples.periodEnd, periodEnd));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.metricId] = Number(r.value);
  return out;
}

/**
 * GET /api/fitness/goodhart — the declared metric-pair catalog plus the
 * latest run of joint-movement findings (computed fresh, not just stored
 * alerts) across the two most recent periods.
 */
export async function GET() {
  const periods = await latestTwoPeriods();
  const pairs = METRICS.map((m) => ({
    metricId: m.id,
    metricName: m.name,
    counterMetricId: m.counterMetricId,
    counterMetricName: getMetric(m.counterMetricId).name,
    goodhartRisk: m.goodhartRisk,
    counterRationale: m.counterRationale,
  }));

  if (!periods) {
    return Response.json({ ok: true, pairs, findings: [], note: "Fewer than 2 periods of data — seed demo data for joint-movement detection." });
  }

  const [prevPeriod, currPeriod] = periods;
  const prevValues = await valuesForPeriod(prevPeriod);
  const currValues = await valuesForPeriod(currPeriod);

  const findings = METRICS.filter((m, idx, arr) => {
    // Avoid reporting both directions of the same pair twice.
    const counter = getMetric(m.counterMetricId);
    const mirrorIndex = arr.findIndex((x) => x.id === counter.id && x.counterMetricId === m.id);
    return mirrorIndex === -1 || idx < mirrorIndex;
  }).map((m) => {
    const counter = getMetric(m.counterMetricId);
    return analyzeGoodhartPair(
      m,
      prevValues[m.id],
      currValues[m.id],
      prevValues[counter.id],
      currValues[counter.id],
    );
  });

  return Response.json({ ok: true, pairs, findings, periods: { previous: prevPeriod, current: currPeriod } });
}

/**
 * POST /api/fitness/goodhart — run detection across the latest two periods
 * and persist any suspicious findings as alerts.
 */
export async function POST() {
  const periods = await latestTwoPeriods();
  if (!periods) {
    return Response.json({ ok: false, error: "Need at least 2 periods of metric samples." }, { status: 400 });
  }
  const [prevPeriod, currPeriod] = periods;
  const prevValues = await valuesForPeriod(prevPeriod);
  const currValues = await valuesForPeriod(currPeriod);

  const seen = new Set<string>();
  const created = [];
  for (const m of METRICS) {
    const pairKey = [m.id, m.counterMetricId].sort().join("::");
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const counter = getMetric(m.counterMetricId);
    const finding = analyzeGoodhartPair(m, prevValues[m.id], currValues[m.id], prevValues[counter.id], currValues[counter.id]);
    if (finding.suspicious) {
      const [row] = await db
        .insert(goodhartAlerts)
        .values({
          metricId: m.id,
          counterMetricId: m.counterMetricId,
          periodStart: prevPeriod,
          periodEnd: currPeriod,
          metricDeltaPct: finding.metricDeltaPct.toFixed(4),
          counterDeltaPct: finding.counterDeltaPct.toFixed(4),
          severity: finding.severity,
          note: finding.note,
        })
        .returning();
      created.push(row);
    }
  }

  return Response.json({ ok: true, alertsCreated: created.length, alerts: created });
}
