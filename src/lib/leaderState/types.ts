// src/lib/leaderState/types.ts
import type { DQScale, ReversibilityClass } from "@/lib/cognitiveLoad";
import type { GrantScope } from "@/lib/privacy";

export interface DecisionRecord {
  id: string;
  ownerUserId: string;
  decidedAt: Date;
  category: string;
  stakes: DQScale;
  timePressure: DQScale;
  informationCompleteness: DQScale;
  clarity: DQScale;
  reversibility: ReversibilityClass;
  selfRatedQuality: DQScale | null;
  notes: string | null;
  createdAt: Date;
}

export interface NewDecisionInput {
  decidedAt?: Date;
  category?: string;
  stakes: DQScale;
  timePressure: DQScale;
  informationCompleteness: DQScale;
  clarity: DQScale;
  reversibility: ReversibilityClass;
  selfRatedQuality?: DQScale | null;
  notes?: string | null;
}

export interface RecoverySignalRecord {
  id: string;
  ownerUserId: string;
  date: string;
  deepWorkBlocksPlanned: number;
  deepWorkBlocksHonored: number;
  quietHoursKept: boolean;
  meetingMinutes: number;
  createdAt: Date;
}

export interface RecoverySignalInput {
  date: string;
  deepWorkBlocksPlanned: number;
  deepWorkBlocksHonored: number;
  quietHoursKept: boolean;
  meetingMinutes: number;
}

export interface GrantEntity {
  id: string;
  ownerUserId: string;
  scope: GrantScope;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
