import { db } from "@/db";
import { settings, autonomousRuns, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { evaluateRules, getIntelligenceReport } from "@/lib/engine";

export interface AutonomousRunSummary {
  evaluated: number;
  critical: number;
  notificationsCreated: number;
  startedAt: string;
  finishedAt: string;
}

export async function runAutonomousPass(): Promise<AutonomousRunSummary> {
  const startedAt = new Date();
  const [runRow] = await db
    .insert(autonomousRuns)
    .values({ startedAt, status: "running", summary: "Evaluating rules..." })
    .returning();

  const { evaluated, critical } = await evaluateRules();
  const report = await getIntelligenceReport();

  let notificationsCreated = 0;
  const criticalFindings = report.findings.filter((f) => f.severity >= 4).slice(0, 5);
  for (const f of criticalFindings) {
    await db.insert(notifications).values({
      title: f.title,
      message: f.detail,
      severity: f.severity,
      domain: f.domain,
    });
    notificationsCreated++;
  }

  const finishedAt = new Date();
  const summary = `Evaluated ${evaluated} rule(s), found ${critical} critical. Org health ${report.orgHealthScore}/100.`;

  await db
    .update(autonomousRuns)
    .set({ finishedAt, status: "success", summary, findingsCount: report.findings.length })
    .where(eq(autonomousRuns.id, runRow.id));

  const existingSettings = await db.select().from(settings).where(eq(settings.id, 1));
  if (existingSettings.length > 0) {
    await db.update(settings).set({ lastRunAt: finishedAt }).where(eq(settings.id, 1));
  } else {
    await db.insert(settings).values({ id: 1, lastRunAt: finishedAt });
  }

  return {
    evaluated,
    critical,
    notificationsCreated,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}
