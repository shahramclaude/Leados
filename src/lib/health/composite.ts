import { getCorrelationId } from "@/lib/observability/requestContext";
import schemaVersionInfo from "@/db/schemaVersion.json";
import type { CompositeHealth, CompositeStatus, HealthCheckResult } from "./types";
import {
  checkAutomationFreshness,
  checkAutomationQueue,
  checkDatabase,
  checkMaintenanceMode,
  checkProcess,
  checkSchemaVersion,
} from "./checks";
import { isShuttingDown } from "./shutdown";

function aggregate(checks: HealthCheckResult[]): CompositeStatus {
  const anyCriticalFail = checks.some((c) => c.critical && c.status === "fail");
  if (anyCriticalFail) return "unhealthy";

  const anyFailOrWarn = checks.some((c) => c.status === "fail" || c.status === "warn");
  if (anyFailOrWarn) return "degraded";

  return "healthy";
}

export async function getCompositeHealth(): Promise<CompositeHealth> {
  const checks = await Promise.all([
    checkDatabase(),
    checkSchemaVersion(),
    checkAutomationQueue(),
    checkAutomationFreshness(),
    checkMaintenanceMode(),
    checkProcess(isShuttingDown),
  ]);

  return {
    status: aggregate(checks),
    service: "leados",
    version: schemaVersionInfo.version,
    generatedAt: new Date().toISOString(),
    correlationId: getCorrelationId(),
    checks,
  };
}

export function httpStatusForComposite(status: CompositeStatus): number {
  if (status === "unhealthy") return 503;
  return 200; // "degraded" still returns 200 so load balancers keep light traffic flowing; see docs/SLO.md
}
