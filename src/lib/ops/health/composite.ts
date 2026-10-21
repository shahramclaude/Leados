import { runAllChecks, type CheckResult } from "./checks";
import { isDraining } from "@/lib/ops/shutdown";

export type OverallStatus = "healthy" | "degraded" | "unhealthy";

export interface CompositeHealth {
  status: OverallStatus;
  timestamp: string;
  draining: boolean;
  checks: CheckResult[];
}

export async function getCompositeHealth(): Promise<CompositeHealth> {
  const checks = await runAllChecks();
  const anyCriticalFail = checks.some((c) => c.critical && c.status === "fail");
  const anyWarnOrNonCriticalFail = checks.some((c) => c.status !== "ok");
  const status: OverallStatus = anyCriticalFail ? "unhealthy" : anyWarnOrNonCriticalFail ? "degraded" : "healthy";
  return { status, timestamp: new Date().toISOString(), draining: isDraining(), checks };
}

export function statusToHttpCode(status: OverallStatus): number {
  if (status === "unhealthy") return 503;
  return 200;
}
