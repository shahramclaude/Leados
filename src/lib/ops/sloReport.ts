// Monthly (or on-demand) SLO report generator. Reads real data — the
// automation ledger, projection lag, outbox delivery latency — and writes a
// markdown report under reports/. "Measure first, then declare."
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { automationRuns, outbox } from "@/db/schema";
import { sql, desc, isNotNull, and, gte, eq } from "drizzle-orm";
import { projectionLagSeconds } from "@/lib/ops/projection";

export const REPORTS_DIR = process.env.REPORTS_DIR || path.join(process.cwd(), "reports");

export interface SloReportData {
  generatedAt: string;
  windowDays: number;
  automationSuccessRate: number | null;
  automationSampleSize: number;
  projectionLagSeconds: number | null;
  notificationDeliveryP95Seconds: number | null;
  path: string;
}

export async function computeSloReportData(windowDays = 30): Promise<SloReportData> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const runs = await db.select().from(automationRuns).where(sql`finished_at >= ${since.toISOString()}`).orderBy(desc(automationRuns.finishedAt));
  const automationSuccessRate = runs.length ? runs.filter((r) => r.status === "succeeded").length / runs.length : null;

  const { lagSeconds } = await projectionLagSeconds();

  const delivered = await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "sent"), isNotNull(outbox.sentAt), gte(outbox.createdAt, since)));
  const latencies = delivered
    .map((r) => (r.sentAt ? (r.sentAt.getTime() - r.createdAt.getTime()) / 1000 : null))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : null;

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    automationSuccessRate,
    automationSampleSize: runs.length,
    projectionLagSeconds: lagSeconds,
    notificationDeliveryP95Seconds: p95,
    path: "",
  };
}

export async function generateSloReport(windowDays = 30): Promise<SloReportData> {
  const data = await computeSloReportData(windowDays);
  await mkdir(REPORTS_DIR, { recursive: true });
  const fileName = `slo-report-${new Date().toISOString().slice(0, 10)}.md`;
  const filePath = path.join(REPORTS_DIR, fileName);
  const md = renderSloReportMarkdown(data);
  await writeFile(filePath, md, "utf8");
  return { ...data, path: filePath };
}

export function renderSloReportMarkdown(data: SloReportData): string {
  const fmt = (v: number | null, digits = 1, suffix = "") => (v === null ? "no data" : `${v.toFixed(digits)}${suffix}`);
  return `# SLO report — generated ${data.generatedAt}

Window: last ${data.windowDays} days. All numbers computed from real rows in
\`automation_runs\` / \`outbox\` / \`projection_org_stats\` at generation time —
"no data" means the measurement genuinely has no samples yet, not zero.

| SLO | Objective | Measured | Sample size |
|---|---|---|---|
| Automation success rate | >= 95% | ${fmt(data.automationSuccessRate ? data.automationSuccessRate * 100 : null, 1, "%")} | ${data.automationSampleSize} runs |
| Projection freshness | <= 60s lag | ${fmt(data.projectionLagSeconds, 1, "s")} | 1 (point-in-time) |
| Notification delivery | p95 <= 60s | ${fmt(data.notificationDeliveryP95Seconds, 1, "s")} | outbox rows sent in window |

See \`docs/SLO.md\` for error-budget math and \`docs/RUNBOOKS.md\` for the response
procedure for any objective in breach.
`;
}
