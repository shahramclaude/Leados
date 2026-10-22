// LEADOS — Part 38: system-level self-diagnostics aggregator.
//
// Pulls together the latest state across checks, drift, remediation,
// findings, and feature flags into one "how healthy is the system right
// now" snapshot. Used by the Assurance Console and by scripts/verify.ts.

import { db } from "@/db";
import { assuranceChecks, assuranceRuns, featureFlags, findings, remediationActions } from "@/db/schema";
import { desc, eq, isNull } from "drizzle-orm";

export interface CheckHealth {
  checkId: string;
  name: string;
  domain: string;
  enabled: boolean;
  latestStatus: string | null;
  latestRunAt: Date | null;
}

export interface SystemDiagnostics {
  checks: CheckHealth[];
  openFindings: number;
  degradedFeatures: number;
  recentRemediations: number;
  overall: "healthy" | "degraded" | "attention_needed";
}

export async function runSelfDiagnostics(): Promise<SystemDiagnostics> {
  const checks = await db.select().from(assuranceChecks);
  const checkHealth: CheckHealth[] = [];

  for (const check of checks) {
    const [latest] = await db
      .select()
      .from(assuranceRuns)
      .where(eq(assuranceRuns.checkId, check.id))
      .orderBy(desc(assuranceRuns.runAt))
      .limit(1);
    checkHealth.push({
      checkId: check.id,
      name: check.name,
      domain: check.domain,
      enabled: check.enabled,
      latestStatus: latest?.status ?? null,
      latestRunAt: latest?.runAt ?? null,
    });
  }

  const openFindingsRows = await db.select().from(findings).where(eq(findings.status, "open"));
  const degradedRows = await db.select().from(featureFlags).where(eq(featureFlags.degraded, true));
  const recentRemediationRows = await db
    .select()
    .from(remediationActions)
    .where(isNull(remediationActions.revertedAt));

  const anyBreach = checkHealth.some((c) => c.latestStatus === "breach");
  const anyWarn = checkHealth.some((c) => c.latestStatus === "warn");
  const overall: SystemDiagnostics["overall"] = anyBreach
    ? "attention_needed"
    : anyWarn || degradedRows.length > 0
      ? "degraded"
      : "healthy";

  return {
    checks: checkHealth,
    openFindings: openFindingsRows.length,
    degradedFeatures: degradedRows.length,
    recentRemediations: recentRemediationRows.length,
    overall,
  };
}
