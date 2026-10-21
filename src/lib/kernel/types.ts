// LEADOS Part 07 — Orchestration Kernel shared types.
//
// These are the exact shapes named in the mission brief (StepKind, Plan,
// Step, Budget, PolicyVersion) plus the supporting actor/policy-decision
// vocabulary used across the rest of the kernel.

export type StepKind =
  | "observe"
  | "orient"
  | "hypothesize"
  | "plan"
  | "act"
  | "verify"
  | "learn";

export type RiskClass = "read" | "low" | "medium" | "high";

export type StepStatus =
  | "pending"
  | "approved"
  | "running"
  | "verifying"
  | "done"
  | "failed"
  | "reverted";

export type RunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "verifying"
  | "done"
  | "failed"
  | "reverted"
  | "halted";

export type ActorKind = "agent" | "human" | "system";

export interface Actor {
  kind: ActorKind;
  id: string;
}

export interface Budget {
  /** Max number of actuating (non-read) steps this run may execute. */
  maxActions: number;
  /** Max wall-clock ms the whole run may take. */
  maxDurationMs: number;
  /** Per-step timeout in ms. */
  stepTimeoutMs: number;
}

export interface PolicyVersion {
  id: string;
  version: number;
}

export interface CompensationHandle {
  capability: string;
  input: unknown;
}

export interface Step {
  id: string;
  runId: string;
  idx: number;
  kind: StepKind;
  capability: string;
  input: unknown;
  idempotencyKey: string;
  compensation?: CompensationHandle;
  risk: RiskClass;
  status: StepStatus;
  entityKey?: string;
  output?: unknown;
  predictedDiff?: PredictedDiff;
  error?: string;
  attempts: number;
}

export interface PredictedDiff {
  summary: string;
  changes: Array<{
    entity: string;
    field: string;
    from: unknown;
    to: unknown;
  }>;
}

export interface Plan {
  planId: string;
  goal: string;
  domain: string;
  planType: string;
  steps: Step[];
  budget: Budget;
  policySnapshot: PolicyVersion;
  dryRun: boolean;
}

export type PolicyDecision = "allow" | "deny" | "require-approval";

export interface PolicyEvaluation {
  decision: PolicyDecision;
  reason: string;
}

export type EnforcementMode = "auto" | "ask" | "manual";

export interface CapabilityContext {
  actor: Actor;
  domain: string;
  runId: string;
  stepId: string;
  dryRun: boolean;
}

export interface Capability<TInput = unknown, TOutput = unknown> {
  name: string;
  riskClass: RiskClass;
  requiredScope: string;
  costEstimate: (input: TInput) => number;
  dryRun: (input: TInput, ctx: CapabilityContext) => Promise<PredictedDiff>;
  execute: (input: TInput, ctx: CapabilityContext) => Promise<TOutput>;
  compensate?: (input: TInput, output: TOutput, ctx: CapabilityContext) => Promise<void>;
  /**
   * Optional post-condition check run after execute(). Returning false (or
   * throwing) triggers compensation when one is registered. This is the
   * kernel's "verify" step made concrete per-capability.
   */
  verify?: (input: TInput, output: TOutput, ctx: CapabilityContext) => Promise<boolean>;
}

export class UnregisteredCapabilityError extends Error {
  constructor(name: string) {
    super(`Capability "${name}" is not registered. Unregistered capabilities cannot be invoked.`);
    this.name = "UnregisteredCapabilityError";
  }
}
