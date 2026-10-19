// =============================================================================
// LEADOS kernel — daily executive briefing
// =============================================================================
// Stable, testable template: overnight findings, decisions pending approval,
// forecast deltas vs yesterday, and a recommended focus for the day. Every
// statement carries an `evidence` array of {type, id} references so nothing
// in the brief is an unsupported claim.

import { db } from "@/db";
import { approvals, auditLog, briefings, findings, metricReadings } from "@/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export interface BriefingStatement {
  text: string;
  evidence: Array<{ type: string; id: number | string }>;
}

export interface BriefingContent {
  forDate: string;
  generatedAt: string;
  headline: string;
  overnightFindings: BriefingStatement[];
  pendingApprovals: BriefingStatement[];
  forecastDeltas: BriefingStatement[];
  recommendedFocus: BriefingStatement;
  auditedActionsLast24h: number;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function generateBriefing(now: Date = new Date()): Promise<BriefingContent> {
  const since = new Date(now.getTime() - 24 * 3600_000);

  const overnight = await db.select().from(findings).where(gte(findings.createdAt, since)).orderBy(desc(findings.severity)).limit(10);
  const pending = await db.select().from(approvals).where(eq(approvals.status, "pending")).orderBy(desc(approvals.requestedAt)).limit(10);
  const auditedToday = await db.select({ id: auditLog.id }).from(auditLog).where(gte(auditLog.createdAt, since));

  // Forecast delta: compare the latest reading per metric key to the reading
  // closest to 24h ago.
  const recentReadings = await db.select().from(metricReadings).where(gte(metricReadings.observedAt, since)).orderBy(metricReadings.observedAt);
  const byKey = new Map<string, typeof recentReadings>();
  for (const r of recentReadings) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  const forecastDeltas: BriefingStatement[] = [];
  for (const [key, readings] of byKey) {
    if (readings.length < 2) continue;
    const first = readings[0];
    const last = readings[readings.length - 1];
    const delta = last.value - first.value;
    forecastDeltas.push({
      text: `Metric "${key}" moved ${delta >= 0 ? "up" : "down"} ${Math.abs(delta).toFixed(2)} over the last 24h (from ${first.value.toFixed(2)} to ${last.value.toFixed(2)}).`,
      evidence: [{ type: "metric_reading", id: first.id }, { type: "metric_reading", id: last.id }],
    });
  }

  const overnightFindings: BriefingStatement[] = overnight.map((f) => ({
    text: `[Severity ${f.severity}] ${f.domain}: ${f.title}`,
    evidence: [{ type: "finding", id: f.id }],
  }));

  const pendingApprovals: BriefingStatement[] = pending.map((a) => ({
    text: `Awaiting approval (${a.riskClass} risk): ${a.summary}`,
    evidence: [{ type: "approval", id: a.id }],
  }));

  const topCritical = overnight.find((f) => f.severity >= 5) ?? overnight[0];
  const recommendedFocus: BriefingStatement = topCritical
    ? {
        text: `Recommended focus: resolve "${topCritical.title}" (${topCritical.domain}, severity ${topCritical.severity}) first.`,
        evidence: [{ type: "finding", id: topCritical.id }],
      }
    : { text: "No open findings in the last 24h — recommended focus is reviewing pending approvals.", evidence: [] };

  const headline = `${overnightFindings.length} new finding(s), ${pendingApprovals.length} approval(s) pending, ${auditedToday.length} audited action(s) in the last 24h.`;

  return {
    forDate: dateKey(now),
    generatedAt: now.toISOString(),
    headline,
    overnightFindings,
    pendingApprovals,
    forecastDeltas,
    recommendedFocus,
    auditedActionsLast24h: auditedToday.length,
  };
}

export async function generateAndStoreBriefing(now: Date = new Date()) {
  const content = await generateBriefing(now);
  const [row] = await db
    .insert(briefings)
    .values({ forDate: content.forDate, content: content as unknown as Record<string, unknown> })
    .returning();
  return { id: row.id, content };
}

export async function getLatestBriefing() {
  const rows = await db.select().from(briefings).orderBy(desc(briefings.generatedAt)).limit(1);
  return rows[0] ?? null;
}

export async function getBriefingForDate(forDate: string) {
  const rows = await db.select().from(briefings).where(eq(briefings.forDate, forDate)).orderBy(desc(briefings.generatedAt)).limit(1);
  return rows[0] ?? null;
}
