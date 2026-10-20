export type CheckStatus = "ok" | "warn" | "fail" | "unknown";

export type HealthCheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  critical: boolean;
  summary: string;
  details?: Record<string, unknown>;
  /** Anchor in docs/RUNBOOKS.md describing how to respond to a non-"ok" status. */
  runbook?: string;
  durationMs: number;
};

export type CompositeStatus = "healthy" | "degraded" | "unhealthy";

export type CompositeHealth = {
  status: CompositeStatus;
  service: "leados";
  version: string;
  generatedAt: string;
  correlationId: string;
  checks: HealthCheckResult[];
};
