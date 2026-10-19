// =============================================================================
// LEADOS kernel — shared types
// =============================================================================

export type RiskClass = "low" | "medium" | "high";

/** auto = runs unattended. ask-once = needs a human approval per invocation.
 *  manual = can never be executed by the kernel; a human must do it outside
 *  the system (the kernel will only ever propose it as a work item). */
export type EnforcementMode = "auto" | "ask-once" | "manual";

export type StepPhase = "observe" | "orient" | "hypothesize" | "plan" | "act" | "verify" | "learn";

export type ToolCallStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "skipped_budget"
  | "skipped_disabled"
  | "skipped_dry_run";

export interface CapabilityContext {
  runId: number;
  dryRun: boolean;
  actor: string;
}

export interface PredictedDiff {
  summary: string;
  changes: Array<{ entity: string; field: string; before: unknown; after: unknown }>;
}

export interface CapabilityResult {
  summary: string;
  data?: Record<string, unknown>;
  /** opaque handle the kernel can hand back to `undo()` later */
  undoHandle?: string;
}

/**
 * A registered capability — the ONLY way the kernel is allowed to touch the
 * outside world. Unregistered capability keys are rejected (default-deny).
 */
export interface Capability<TParams = Record<string, unknown>> {
  key: string;
  description: string;
  domain: string;
  riskClass: RiskClass;
  defaultMode: EnforcementMode;
  permissionScope: string;
  dryRunSupported: true;
  /** Estimate the "cost" of running this (counts against the domain's daily
   *  write budget). Pure, synchronous, no side effects. */
  estimateCost: (params: TParams) => number;
  /** Predict what would change, without writing anything. Must be safe to
   *  call unconditionally — this is what "simulate first" mode runs. */
  simulate: (params: TParams, ctx: CapabilityContext) => Promise<PredictedDiff>;
  /** Perform the real write. Only ever invoked by the kernel after mode +
   *  budget + approval checks have all passed. */
  execute: (params: TParams, ctx: CapabilityContext) => Promise<CapabilityResult>;
  /** Compensate / reverse a previous execute() call, given the undoHandle it
   *  returned. Capabilities that are not reversible should throw. */
  undo: (undoHandle: string, ctx: CapabilityContext) => Promise<void>;
}

export interface PlannedAction<TParams = Record<string, unknown>> {
  capabilityKey: string;
  params: TParams;
  rationale: string;
}
