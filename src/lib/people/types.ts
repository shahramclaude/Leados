// src/lib/people/types.ts
//
// Shared types for the LEADOS people-analytics domain.
//
// NOTE ON PART DEPENDENCIES: this repository snapshot does not contain Parts
// 01 (event log), 04 or 06 (digital twin) yet. Where this part needs those
// capabilities it defines small, clearly-labelled proxy interfaces
// (`src/lib/events/eventLog.ts`, `src/lib/twin/workloadFeed.ts`) shaped so
// that swapping in the real Part 01 / Part 06 implementations later is a
// drop-in replacement (same function signatures, same event shape).

export type EvidenceSource = "claimed" | "endorsed" | "demonstrated-by-work-evidence";

export type SkillLevel = 1 | 2 | 3 | 4 | 5;

export interface Skill {
  id: string;
  name: string;
  category: string;
  /** Prerequisite skills — you generally need these before this one makes sense. */
  requires: string[];
  /** Skills this one is a deeper/narrower refinement of (specializes -> base skill id). */
  specializes: string[];
  /** Skills considered interchangeable for fit-scoring purposes. */
  equivalent: string[];
  /** Written behavioral anchor for every level 1-5. No bare numbers without a definition. */
  levelAnchors: Record<SkillLevel, string>;
}

export interface SkillEvidence {
  id: string;
  personId: string;
  skillId: string;
  source: EvidenceSource;
  /** The level this piece of evidence supports. */
  level: SkillLevel;
  recordedAt: string; // ISO date
  /** Free-text or link to the artifact/person backing the evidence. Never hidden from the subject. */
  evidenceRef?: string;
  recordedBy?: string;
  /** Set when evidence was superseded by a contestation correction. Never deleted — struck through. */
  supersededBy?: string;
  invalidated?: boolean;
}

export interface EffectiveSkillLevel {
  skillId: string;
  level: number; // may be fractional pre-rounding, exposed rounded in UI
  confidence: number; // 0..1
  evidenceCount: number;
  staleness: "fresh" | "aging" | "stale" | "none";
  inferred: boolean; // true if derived via specialization propagation, not direct evidence
  lastEvidenceAt: string | null;
}

export interface Role {
  id: string;
  name: string;
  coreSkills: Record<string, SkillLevel>; // skillId -> minLevel
  complementarySkills: Record<string, number>; // skillId -> weight (0..1)
  adjacencyRoles: string[];
}

export interface NamedGap {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel;
  currentLevel: number;
  delta: number;
  closableWithinMonths: number; // heuristic estimate, always shown with gap, never standalone
}

export interface Person {
  id: string;
  name: string;
  title: string;
  teamId: string;
  managerId: string | null;
}

export interface WorkloadSnapshot {
  personId: string;
  date: string; // ISO date
  wip: number; // work-in-progress items
  contextSwitches: number; // distinct task-context switches that day
  meetingHours: number; // hours in meetings that day
  source: "twin-proxy" | "manual";
}

export type PeopleScopeRole = "self" | "manager" | "hr" | "org";

export interface PeopleScope {
  viewerId: string;
  viewerRole: PeopleScopeRole;
  subjectId?: string;
  purpose: string;
}
