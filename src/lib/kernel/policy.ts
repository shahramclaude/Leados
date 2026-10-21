// Policy engine — evaluates every step before execution.
//
// Decision order (all must pass for "allow"):
//  1. Global kill switch engaged -> deny (handled by orchestrator directly,
//     checked first, before policy is even consulted).
//  2. Domain paused (severity-5 tripwire or manual) -> deny non-read steps.
//  3. Capability must be registered -> deny (defense in depth; orchestrator
//     already enforces this via requireCapability).
//  4. Budget remaining for (domain, capability, day) -> deny if exhausted.
//  5. Risk class + per-capability auto-mode override + active time-boxed
//     delegation -> allow / require-approval / deny.
//
// Policies are versioned data (`kernel_policy_versions`); every run records
// the policy version it executed under in `kernel_runs.policy_version`.
import { db } from "@/db";
import { kernelCapabilityOverrides, kernelDelegations, kernelPolicyVersions } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { newId } from "./ids";
import type { EnforcementMode, PolicyEvaluation, PolicyVersion, RiskClass } from "./types";

export const DEFAULT_RISK_MODE: Record<RiskClass, EnforcementMode> = {
  read: "auto",
  low: "auto",
  medium: "ask",
  high: "manual",
};

export async function getActivePolicyVersion(): Promise<PolicyVersion> {
  const [row] = await db
    .select()
    .from(kernelPolicyVersions)
    .where(eq(kernelPolicyVersions.isActive, true))
    .orderBy(desc(kernelPolicyVersions.version))
    .limit(1);
  if (row) return { id: row.id, version: row.version };
  // Bootstrap v1 the first time this is ever called.
  const id = "v1";
  await db
    .insert(kernelPolicyVersions)
    .values({ id, version: 1, rules: { defaultRiskMode: DEFAULT_RISK_MODE }, isActive: true })
    .onConflictDoNothing();
  return { id, version: 1 };
}

export async function getCapabilityMode(capability: string): Promise<EnforcementMode | null> {
  const [row] = await db
    .select()
    .from(kernelCapabilityOverrides)
    .where(eq(kernelCapabilityOverrides.capability, capability))
    .limit(1);
  return (row?.mode as EnforcementMode) ?? null;
}

export async function setCapabilityMode(capability: string, mode: EnforcementMode, updatedBy: string): Promise<void> {
  await db
    .insert(kernelCapabilityOverrides)
    .values({ id: newId("capovr"), capability, mode, updatedBy })
    .onConflictDoUpdate({
      target: kernelCapabilityOverrides.capability,
      set: { mode, updatedBy, updatedAt: new Date() },
    });
}

export async function createDelegation(params: { scope: string; mode: EnforcementMode; createdBy: string; ttlMs: number }) {
  const id = newId("deleg");
  const expiresAt = new Date(Date.now() + params.ttlMs);
  await db.insert(kernelDelegations).values({
    id,
    scope: params.scope,
    mode: params.mode,
    createdBy: params.createdBy,
    expiresAt,
  });
  return { id, expiresAt };
}

async function hasActiveDelegation(scope: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(kernelDelegations)
    .where(and(eq(kernelDelegations.scope, scope), gt(kernelDelegations.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

export async function resolveEnforcementMode(capability: string, risk: RiskClass): Promise<EnforcementMode> {
  const override = await getCapabilityMode(capability);
  if (override) return override;

  const capDelegated = await hasActiveDelegation(capability);
  if (capDelegated) return "auto";
  const riskDelegated = await hasActiveDelegation(`risk:${risk}`);
  if (riskDelegated) return "auto";

  return DEFAULT_RISK_MODE[risk];
}

export interface PolicyEvaluationInput {
  capability: string;
  risk: RiskClass;
  domain: string;
  domainPaused: boolean;
  budgetOk: boolean;
}

export async function evaluateStepPolicy(input: PolicyEvaluationInput): Promise<PolicyEvaluation> {
  if (input.risk !== "read" && input.domainPaused) {
    return { decision: "deny", reason: `Domain "${input.domain}" is paused (severity-5 tripwire or manual pause).` };
  }
  if (input.risk !== "read" && !input.budgetOk) {
    return { decision: "deny", reason: `Daily budget exhausted for capability "${input.capability}" in domain "${input.domain}".` };
  }
  const mode = await resolveEnforcementMode(input.capability, input.risk);
  if (mode === "manual") {
    return { decision: "require-approval", reason: `Capability "${input.capability}" is in manual mode.` };
  }
  if (mode === "ask") {
    if (input.risk === "read") return { decision: "allow", reason: "Read-only steps never require approval." };
    return { decision: "require-approval", reason: `Capability "${input.capability}" (risk=${input.risk}) requires approval under current policy.` };
  }
  // mode === "auto"
  return { decision: "allow", reason: `Capability "${input.capability}" is auto-approved under current policy/delegation.` };
}
