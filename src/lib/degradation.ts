// LEADOS — Part 35 resilience lab: user-facing degradation status.
//
// Distinct from an ops-only health page: this answers "what can I actually do
// right now?" for an end user, not "which pod is red" for an engineer. Reads
// circuit breaker state (src/lib/circuitBreaker.ts, persisted in
// resilience_circuit_breakers) plus the fault-injection control plane so the
// page reflects whatever chaos experiment is currently running in staging.

import { db } from "@/db";
import { circuitBreakerStates } from "@/db/schema";
import { controlPlane } from "./faultInjection";

export type DependencyStatus = "operational" | "degraded" | "outage";

export type UserFacingDegradation = {
  dependencyKey: string;
  label: string;
  status: DependencyStatus;
  userMessage: string;
  capabilityImpact: string;
};

function breakerStateToStatus(state: string): DependencyStatus {
  if (state === "open") return "outage";
  if (state === "half_open") return "degraded";
  return "operational";
}

export async function getUserFacingDegradation(): Promise<UserFacingDegradation[]> {
  const rows = await db.select().from(circuitBreakerStates);

  const dbStatus: UserFacingDegradation = controlPlane.db.outage || controlPlane.db.killedUntil
    ? {
        dependencyKey: "db",
        label: "Core database",
        status: "outage",
        userMessage: "LEADOS is temporarily unable to read or save new data. We are recovering automatically.",
        capabilityImpact: "Read and write operations are paused; cached pages may still render.",
      }
    : controlPlane.db.latencyMs > 0
      ? {
          dependencyKey: "db",
          label: "Core database",
          status: "degraded",
          userMessage: "LEADOS is running slower than usual and may show slightly stale data.",
          capabilityImpact: "Read-only / cached fallback is being served for some pages.",
        }
      : {
          dependencyKey: "db",
          label: "Core database",
          status: "operational",
          userMessage: "All systems operating normally.",
          capabilityImpact: "None.",
        };

  const breakerEntries: UserFacingDegradation[] = rows.map((r) => ({
    dependencyKey: r.dependencyKey,
    label: r.label,
    status: breakerStateToStatus(r.state),
    userMessage: r.userVisibleMessage,
    capabilityImpact: r.degradedModeDescription,
  }));

  return [dbStatus, ...breakerEntries];
}
