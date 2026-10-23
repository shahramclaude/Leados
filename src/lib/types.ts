// Shared types for Part 48 — Commitments, Delegation, Proactive Drafts, Loops.

export type Explain<T> = {
  result: T;
  passed: boolean;
  reason: string;
  evidence: Record<string, unknown>;
  ruleRef?: string;
};

export type CommitmentStatus = "open" | "kept" | "broken" | "renegotiated";

export type Person = {
  id: string;
  name: string;
  role: string;
  team: string;
  email: string;
  powerLevel: number;
  managerId: string | null;
};

export type Commitment = {
  id: string;
  promisorId: string;
  promiseeId: string;
  content: string;
  dueAt: Date;
  context: { sourceType: string; sourceId?: string; surface?: string };
  status: CommitmentStatus;
  confirmed: boolean;
  renegotiatedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AutonomyTier = "T1" | "T2" | "T3" | "T4";

export type Stakes = "normal" | "elevated" | "critical";

export type TriggerType =
  | "deadline_slipping"
  | "decision_stagnating"
  | "meeting_no_actions"
  | "metric_drifting"
  | "delegation_unchecked";

export type DraftType = "email" | "agenda_item" | "task" | "nudge" | "digest";

export type ProactiveDraft = {
  id: string;
  triggerType: TriggerType;
  surfaceRef: Record<string, unknown>;
  draftType: DraftType;
  targetPersonId: string;
  draftContent: string;
  whyThis: string;
  whyNow: string;
  stakes: Stakes;
  actionClassKey: string;
  autonomyTier: AutonomyTier;
  batchedCount: number;
  status: "queued" | "approved" | "sent" | "dismissed" | "auto_sent";
};

export type DelegationCheckType = "authority" | "capacity" | "growth";
