/**
 * src/lib/types.ts — THE single, coherent type system for the Leados
 * event-sourced intelligence brain.
 *
 * CONTEXT / AUDIT NOTE (Part 1 of 12):
 * The real github.com/shahramclaude/Leados repo (inspected directly for
 * this task, see chat summary for the full audit) contains at least THREE
 * mutually-incompatible "LeadosEvent" / "Domain" / "Projection" shapes:
 *   1. root `types.ts`      — Domain = people|finance|ops|strategy|legal,
 *      LeadosEvent = { id, ts, type, data, meta }.
 *   2. root `catalog.ts`    — DOMAINS const uses finance|people|ops|strategy
 *      |rd|compliance|manufacturing (7 values) which do NOT all exist in
 *      the root Domain union above (rd/compliance/manufacturing are
 *      missing from it, "legal" is missing from catalog.ts).
 *   3. `src/lib` (Next.js)  — LeadosEvent = { id, type, occurredAt,
 *      personId, teamId, data } — a completely different shape with no
 *      `ts`/`meta` fields at all.
 * None of these three can be folded by a single project() function.
 * This file is the fix: ONE DomainKey union (8 domains), ONE LeadosEvent
 * shape, and ONE Projection/BrainProjection family, imported by every
 * rule, every physics law, and every API route in this codebase from
 * this point forward. Nothing else in `src/lib` defines its own event or
 * domain shape — see eventBrain.ts, ruleEngine.ts, causalInference.ts.
 */

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export type DomainKey =
  | "finance"
  | "people"
  | "strategy"
  | "operations"
  | "rd"
  | "compliance"
  | "manufacturing"
  | "customerSuccess";

export const DOMAIN_KEYS: DomainKey[] = [
  "finance",
  "people",
  "strategy",
  "operations",
  "rd",
  "compliance",
  "manufacturing",
  "customerSuccess",
];

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  finance: "Finance",
  people: "People",
  strategy: "Strategy",
  operations: "Operations",
  rd: "R&D",
  compliance: "Compliance",
  manufacturing: "Manufacturing",
  customerSuccess: "Customer Success",
};

// ---------------------------------------------------------------------------
// Event log — the single source of truth
// ---------------------------------------------------------------------------

export interface LeadosEvent<T = Record<string, any>> {
  id: string;
  ts: string; // ISO-8601, always authoritative ordering key
  type: string; // e.g. "finance.runway.snapshot"
  data: T;
  meta?: { seeded?: boolean; [k: string]: any };
}

// ---------------------------------------------------------------------------
// Core entities folded out of the event log by project()
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  title: string;
  reportsTo: string | null;
  createdAt: string; // ISO — tenure start
}

export interface Goal {
  id: string;
  title: string;
  domain: DomainKey;
  ownerId: string | null;
  ts: string;
  lastProgressTs: string | null;
  closed: boolean;
  result?: "success" | "missed" | string;
  deadline?: string | null;
}

export interface Decision {
  id: string;
  title: string;
  domain: DomainKey;
  ts: string;
  outcome?: string;
  outcomeTs?: string;
  escalated?: boolean;
}

export interface Commitment {
  id: string;
  ownerId: string | null;
  desc: string;
  by_date: string;
  ts: string;
  resolved: boolean;
  resolvedTs?: string;
}

export interface Finding {
  key: string;
  domain: DomainKey;
  sev: number; // 1-5 (0 = not firing, filtered out before display)
  ts: string;
  title: string;
  rule: string; // rule id, e.g. "F01"
  confidence: number; // 0-1
  basis: string;
  scoreMath: string;
  evidenceEvents: string[];
  suggestedPlaybook: string | null;
  amplificationFactor?: number; // set by causalInference when part of a cascade
}

// ---------------------------------------------------------------------------
// Projection — base read-state folded from the event log
// ---------------------------------------------------------------------------

export interface Projection {
  events: LeadosEvent[];
  people: Person[];
  peopleById: Record<string, Person>;
  lines: { broken: { personId: string; reportsTo: string }[] };
  goals: Goal[];
  goalById: Record<string, Goal>;
  openGoals: Goal[];
  decisions: Decision[];
  decisionById: Record<string, Decision>;
  openDecisions: Decision[];
  commitments: Commitment[];
  commitmentById: Record<string, Commitment>;
  openCommitments: Commitment[];
}

// ---------------------------------------------------------------------------
// Rule system
// ---------------------------------------------------------------------------

export type RuleId = string; // "F01".."CS06"

export interface RuleEvaluation {
  firing: boolean;
  severity: 0 | 1 | 2 | 3 | 4 | 5;
  confidence: number; // 0-1
  basis: string;
  scoreMath: string;
  evidenceEvents: string[];
  suggestedPlaybook: string | null;
}

export interface RuleState {
  ruleId: RuleId;
  active: boolean;
  severity: number;
  confidence: number;
  lastFiredAt: string | null;
  consecutiveFirings: number;
  scoreMath: string;
  basis: string;
}

export interface RuleDef {
  id: string;
  tag: string;
  domain: DomainKey;
  firesWhen: string;
  severityRule: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  playbook: string | null;
  resolvesWhen: string;
  dismissible: boolean;
  settingsKeys: string[];
  wired: boolean;
}

export interface PlaybookDef {
  id: string;
  title: string;
  domain: DomainKey;
  forRules: string[];
  forWhat: string;
}

// ---------------------------------------------------------------------------
// Domain metrics
// ---------------------------------------------------------------------------

export interface DomainMetricState {
  key: DomainKey;
  currentScore: number; // 0-10
  velocity: number; // points/day
  direction: "improving" | "degrading" | "stable";
  projectedIn14d: number;
  projectedIn30d: number;
  historicalScores: { date: string; score: number }[];
  confidenceLevel: "high" | "medium" | "low";
  eventCount: number; // events in last 90 days for this domain
}

// ---------------------------------------------------------------------------
// Org physics (Part 2 brief, adapted — see orgPhysics.ts)
// ---------------------------------------------------------------------------

export interface ChangePhysics {
  mass: number;
  weeksToEmbed: number;
  confidence: "low";
  label: string;
  meanTenureMonths: number;
  eventsPerWeek: number;
}

export interface EntropyIndicator {
  name: string;
  value: number;
  description: string;
  source: string;
}

export interface OrgEntropy {
  compositeEntropy: number; // 0..100
  indicators: EntropyIndicator[];
  interpretation: string;
  label: string;
}

export interface LeadershipEnergy {
  sourceEnergy: number;
  drainEnergy: number;
  balance: number;
  wins: number;
  activeDrains: number;
  assessment: string;
  label: string;
}

export type ResonanceDirection = "AMPLIFYING" | "FADING" | "STABLE";

export interface ResonanceState {
  eventType: string;
  totalCount: number;
  firstHalfFreqPerWeek: number;
  secondHalfFreqPerWeek: number;
  changeRatio: number | null;
  direction: ResonanceDirection;
  label: string;
}

export interface OrgPhysicsSnapshot {
  entropy: OrgEntropy;
  energyBudget: LeadershipEnergy;
  resonance: ResonanceState | null;
  changePhysics: ChangePhysics;
  compositeHealthScore: number; // 0-100
}

// ---------------------------------------------------------------------------
// Hypotheses & knowledge graph
// ---------------------------------------------------------------------------

export interface HypothesisState {
  id: string;
  ruleId: string;
  domain: DomainKey;
  claim: string;
  predictedAt: string;
  resolveBy: string;
  status: "open" | "confirmed" | "refuted" | "expired";
  evidence: string[];
}

export type KnowledgeNodeType = "finding" | "decision" | "person" | "goal";
export type KnowledgeRelation = "caused" | "resolved" | "blocked" | "informed" | "triggered";

export interface KnowledgeLink {
  fromType: KnowledgeNodeType;
  fromId: string;
  toType: KnowledgeNodeType;
  toId: string;
  relation: KnowledgeRelation;
  confidence: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Brain projection / findings / delta
// ---------------------------------------------------------------------------

export interface BrainProjection extends Projection {
  domainMetrics: Record<DomainKey, DomainMetricState>;
  orgPhysicsState: OrgPhysicsSnapshot;
  ruleStates: Record<RuleId, RuleState>;
  hypotheses: HypothesisState[];
  knowledgeLinks: KnowledgeLink[];
}

export type RiskProfile = "green" | "yellow" | "amber" | "red" | "critical";

export interface BrainFindings {
  findings: Finding[];
  orgHealthScore: number; // 0-100
  dominantDomain: DomainKey;
  riskProfile: RiskProfile;
  physicsSummary: string;
  uncertaintyCount: number;
  novelFindings: Finding[];
}

export interface BrainDelta {
  newFindings: Finding[];
  resolvedFindings: Finding[];
  scoreChanges: { domain: DomainKey; before: number; after: number }[];
  orgHealthDelta: number;
}

export interface ReplayObserver {
  onEvent?: (event: LeadosEvent, index: number, projectionSoFar: BrainProjection) => void;
  onComplete?: (finalProjection: BrainProjection) => void;
}

// ---------------------------------------------------------------------------
// Causal inference
// ---------------------------------------------------------------------------

export type CausalLinkId =
  | "CL01" | "CL02" | "CL03" | "CL04" | "CL05" | "CL06"
  | "CL07" | "CL08" | "CL09" | "CL10" | "CL11" | "CL12";

export interface CausalLinkDef {
  id: CausalLinkId;
  fromRule: RuleId;
  toRule: RuleId;
  lagMinDays: number;
  lagMaxDays: number;
  mechanism: string;
  strength: number; // DESIGN PARAMETER: not calibrated from data. Adjust based on observed outcomes.
}

export interface CausalCascade {
  link: CausalLinkId;
  fromFiring: RuleState;
  toFiring: RuleState;
  confidence: number;
  amplificationFactor: number;
  intervention: string;
}
