// Shared type contracts for the Leados command-center intelligence layer.
// These types are used on both server (engine, API routes) and client
// (hooks, components) — keep this file free of server-only imports.

export type Domain =
  | "people"
  | "strategic"
  | "financial"
  | "execution"
  | "signals"
  | "legal"
  | "product"
  | "culture";

export const DOMAINS: Domain[] = [
  "people",
  "strategic",
  "financial",
  "execution",
  "signals",
  "legal",
  "product",
  "culture",
];

export type Severity = 1 | 2 | 3 | 4 | 5;

export interface Finding {
  id: string;
  domain: Domain;
  severity: Severity;
  title: string;
  detail: string;
  probability: number | null;
  confidence: number;
  createdAt: string; // ISO timestamp
  playbookId: string | null;
  dismissed: boolean;
}

export interface Decision {
  id: string;
  title: string;
  domain: Domain;
  deadline: string | null; // ISO timestamp
  status: "open" | "done";
}

export interface Hypothesis {
  id: string;
  title: string;
  domain: Domain;
  status: "open" | "confirmed" | "refuted";
  resolvesAt: string | null;
  confidence: number;
}

export interface Playbook {
  id: string;
  title: string;
  domain: Domain;
  status: "triggered" | "in_progress" | "done";
  findingId: string | null;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  domain: Domain;
  riskScore: number;
  notes: string;
}

export interface LatentNode {
  id: string;
  label: string;
  domain: Domain;
  posterior: number;
  confidence: number;
  updatedAt: string;
}

export interface Briefing {
  id: string;
  date: string;
  executiveSummary: string;
  bullets: string[];
  fullText: string;
}

export interface NotificationItem {
  id: string;
  domain: Domain;
  severity: Severity;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface OrchestratorResult {
  generatedAt: string;
  domainHealth: Record<Domain, number>;
  priorDomainHealth: Record<Domain, number>;
  findings: Finding[];
  decisions: Decision[];
  hypotheses: Hypothesis[];
  playbooks: Playbook[];
  people: Person[];
  latentNodes: LatentNode[];
  cascadeRisk: number;
  orgHealthScore: number;
  systemConfidence: number;
  situationalAssessment: string;
  briefing: Briefing | null;
}

export type AgentStatus = "running" | "idle" | "degraded";

export interface AgentCycleResult {
  status: AgentStatus;
  lastRun: string;
  nextRun: string;
  playbooksTriggeredThisWeek: number;
  hypothesesOpen: number;
  hypothesesConfirmed: number;
  hypothesesRefuted: number;
}

export interface CommandPaletteItem {
  type: "route" | "person" | "decision" | "blocker" | "finding" | "hypothesis";
  id: string;
  label: string;
  sublabel: string;
  severity: number | null;
  route: string;
}

export type SidePanelType =
  | "person"
  | "project"
  | "finding"
  | "decision"
  | "hypothesis"
  | null;

export interface SidePanelState {
  type: SidePanelType;
  entityId: string | null;
}

// SSE event payload shapes -----------------------------------------------

export interface FindingsDeltaEvent {
  type: "findings_delta";
  findings: Finding[];
  domainHealth: Record<Domain, number>;
  orgHealthScore: number;
}

export interface BeliefUpdateEvent {
  type: "belief_update";
  cascadeRisk: number;
  systemConfidence: number;
  latentNodes: LatentNode[];
}

export interface AgentCycleCompleteEvent {
  type: "agent_cycle_complete";
  agentStatus: AgentCycleResult;
}

export type RealtimeServerEvent =
  | FindingsDeltaEvent
  | BeliefUpdateEvent
  | AgentCycleCompleteEvent;
