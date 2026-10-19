// src/lib/types.ts
//
// PROVENANCE NOTE (read before trusting any "Part 1/2" cross-reference in
// this file or its siblings): this sandbox checkout of shahramclaude/Leados
// is the unmodified `nextjs-postgresql-template` starter. `src/lib/`,
// `src/views/`, and every file this Part-3 brief says to "read before
// writing" (talentEngine.ts, flightRisk.ts, performance.ts, fatigue.ts,
// familiarity.ts, lifeStage.ts, orgNetwork.ts, orgODE.ts, orgDesign.ts,
// genome.ts, beliefFabric.ts) did not exist anywhere in the repo at the
// start of this session (verified with `list_files`/`find` before writing
// a single line). There was nothing to quote exports or caller counts
// from. Rather than fabricate a reading of files that are not there, this
// delivery authors the full dependency stack from scratch, in-session, and
// marks every non-trivial formula with a CITATION comment: either a real
// external reference (e.g. standard PageRank) or `UNVERIFIED (original
// heuristic authored this session)` where the brief specified a model but
// no prior implementation exists to borrow from.
//
// Shared domain types for the People Intelligence module live here so
// src/lib/talentEngine.ts, src/lib/orgNetwork.ts, and
// src/lib/conversationIntelligence.ts can all depend on one source of
// truth without circular runtime imports (type-only imports are erased at
// compile time so the small cycle with conversationIntelligence.ts is safe).

import type { ConversationSignals } from "./conversationIntelligence";

export type PersonId = number;

export type PersonStatus = "active" | "departed" | "archived";

export interface PersonRecord {
  id: PersonId;
  name: string;
  role: string;
  team: string;
  managerId: PersonId | null;
  email: string;
  startDate: string; // ISO date
  status: PersonStatus;
  skills: string[];
  performanceScore: number | null; // 0-100, HR-provided baseline rating
  promotionReadiness: number | null; // 0-100, HR-provided baseline
  growthVelocity: number | null; // 0-1, HR-provided baseline
  compensationFlag: boolean;
}

export interface OneOnOneRecord {
  id: number;
  personId: PersonId;
  managerId: PersonId | null;
  date: string; // ISO date
  notes: string;
  createdAt: string;
}

export type LeadosEventType = "pulse" | "promotion" | "review" | "goal" | "collab";

export interface LeadosEvent {
  id: number;
  personId: PersonId;
  type: LeadosEventType;
  psychologicalSafetyIndex: number | null; // 0-1, present on 'pulse' events
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface OrgNetworkEdge {
  source: PersonId;
  target: PersonId;
  weight: number; // 0-1 collaboration strength
}

export interface OrgNetworkNode {
  personId: PersonId;
  centrality: number; // 0-1, normalized PageRank-style score
  degree: number;
}

export interface OrgNetworkReport {
  nodes: OrgNetworkNode[];
  edges: OrgNetworkEdge[];
  isolatedCount: number;
  bridgeIds: PersonId[]; // centrality > 0.6
  generatedAt: string;
}

export interface UncertaintyFlag {
  nodeId: string; // e.g. "flightRisk:12"
  personId: PersonId | null;
  confidence: number; // 0-1
  message: string;
}

export type LifeStage =
  | "early_career"
  | "establishing"
  | "growth"
  | "senior_steady"
  | "plateau"
  | "legacy";

export interface PersonProfile extends PersonRecord {
  tenureMonths: number;
  flightRisk: number; // 0-1
  flightRiskFactors: string[];
  burnoutRisk: number; // 0-1
  performanceScoreResolved: number; // 0-100
  potentialScore: number; // 0-100
  growthVelocityResolved: number; // 0-1
  promotionReadinessResolved: number; // 0-100
  centrality: number; // 0-1
  lifeStage: LifeStage;
  conversationSignals: ConversationSignals[]; // most recent first, up to 3
  lastOneOnOneDate: string | null;
}

export interface SuccessionRisk {
  personId: PersonId;
  isKeyPerson: boolean;
  hasSuccessor: boolean;
  timeToReadiness: number; // months, 0 if ready, 24 if no candidate
  riskScore: number; // 0-100
  candidateIds: PersonId[];
  gapSkills: string[];
}

export interface TeamRedFlag {
  type: "dominant_voice" | "silent_members" | "exit_cluster" | "burnout_cluster" | "comp_cluster";
  description: string;
  affectedPersonIds: PersonId[];
}

export interface TeamChemistryReport {
  team: string;
  cohesionScore: number; // 0-100
  psychologicalSafetyScore: number; // 0-100
  conflictIndicators: string[];
  collaborationHealth: "strong" | "adequate" | "fragile" | "broken";
  teamMoodTrend: "improving" | "stable" | "declining";
  dominantTopics: string[];
  redFlags: TeamRedFlag[];
}

export interface NineBoxPlacement {
  personId: PersonId;
  name: string;
  box: string; // e.g. "high-high"
  performanceScore: number;
  potentialScore: number;
  quadrantLabel: string;
  suggestedAction: string;
}

export interface NineBoxResult {
  placements: NineBoxPlacement[];
  topRightCount: number;
  bottomLeftCount: number;
  flightRiskInTopRight: number;
  averageBox: string;
}

export interface NetworkAnomaly {
  type: "new_bottleneck" | "isolation_spike" | "bridge_loss" | "cluster_split" | "centrality_shift";
  personId: PersonId | null;
  description: string;
  severity: 1 | 2 | 3;
}

export interface PeopleIntelligenceReport {
  teamHealthScore: number;
  nineBox: NineBoxResult;
  profiles: PersonProfile[];
  successionRisks: SuccessionRisk[];
  teamChemistry: TeamChemistryReport[];
  networkAnomalies: NetworkAnomaly[];
  knowledgeSiloIndex: number;
  uncertaintyFlags: UncertaintyFlag[];
  generatedAt: string;
}
