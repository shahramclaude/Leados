// Burn-rate style SLO breach scan: runs on a schedule, evaluates the same
// checks the composite health endpoint exposes, and auto-opens a `finding`
// row (deduped while already open) when an objective is breached. This is
// the "SLO breach auto-opens a finding" automation mandate.
import { db } from "@/db";
import { findings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { runAllChecks } from "@/lib/ops/health/checks";
import { logger } from "@/lib/obs/logger";
import { setGauge } from "@/lib/obs/metrics";

// Error-budget bookkeeping: 30-day rolling windows per docs/SLO.md.
const ERROR_BUDGETS: Record<string, number> = {
  availability: 0.005, // 99.5% objective -> 0.5% budget
  automation_success: 0.05, // 95% objective -> 5% budget
};

export async function scanForSloBreaches() {
  const checks = await runAllChecks();
  const opened: string[] = [];

  for (const check of checks) {
    if (check.status === "fail") {
      const existing = await db
        .select()
        .from(findings)
        .where(and(eq(findings.kind, `slo_breach:${check.id}`), eq(findings.status, "open")))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(findings).values({
          kind: `slo_breach:${check.id}`,
          severity: check.critical ? "critical" : "warning",
          title: `SLO breach: ${check.label}`,
          detail: { check },
          status: "open",
        });
        opened.push(check.id);
        logger.error("slo.breach_opened", { checkId: check.id, summary: check.summary });
      }
    } else {
      // Auto-resolve a previously open finding once the check recovers.
      await db
        .update(findings)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(and(eq(findings.kind, `slo_breach:${check.id}`), eq(findings.status, "open")));
    }
  }

  // Publish remaining error-budget gauges (coarse: 1.0 when healthy, 0 when
  // the critical SLO it maps to is currently failing — a fuller rolling-
  // window burn-rate calculation is a documented follow-up).
  const dbCheck = checks.find((c) => c.id === "database");
  setGauge("slo_error_budget_remaining_ratio", dbCheck?.status === "fail" ? 0 : 1, { slo: "availability" });
  const automationCheck = checks.find((c) => c.id === "automation_freshness");
  const successRate = (automationCheck?.details.successRate as number | undefined) ?? 1;
  const budget = ERROR_BUDGETS.automation_success;
  const remaining = Math.max(0, 1 - (1 - successRate) / budget);
  setGauge("slo_error_budget_remaining_ratio", remaining, { slo: "automation_success" });

  return opened;
}
