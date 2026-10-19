// Shared, view-facing domain types for the Leados cognitive workspace.
// These types are intentionally free of any Node/DB imports so they can be
// safely imported from client components and from src/lib/selfTest.ts.

export const DOMAINS = [
  "cockpit",
  "people",
  "strategic",
  "financial",
  "execution",
  "signals",
  "hypotheses",
  "about",
] as const;

export type DomainKey = (typeof DOMAINS)[number];

export type Severity = 1 | 2 | 3 | 4 | 5;

export type HealthStatus = "healthy" | "at_risk" | "critical";

export interface Finding {
  id: string;
  domain: DomainKey;
  sev: Severity;
  title: string;
  detail: string;
  status: "open" | "resolved";
  createdAt: string;
}

export interface DomainHealth {
  domain: DomainKey;
  score: number;
  status: HealthStatus;
  criticalFindings: number;
  findingCount: number;
}

export interface PersonSummary {
  id: string;
  name: string;
  role: string;
  team: string;
  flightRisk: number;
  oneOnOneQuality: number;
  daysSinceLastOneOnOne: number | null;
}

export interface DecisionSummary {
  id: string;
  title: string;
  domain: DomainKey;
  status: "open" | "closed";
  sev: Severity;
  createdAt: string;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  domain: DomainKey;
  status: "active" | "archived";
  sev: Severity;
  createdAt: string;
}

export interface BlockerSummary {
  id: string;
  title: string;
  domain: DomainKey;
  projectId: string | null;
  status: "open" | "resolved";
  sev: Severity;
  createdAt: string;
}

export interface HypothesisSummary {
  id: string;
  personId: string;
  personName: string;
  type: string;
  title: string;
  sev: Severity;
  status: "open" | "dismissed" | "confirmed";
  createdAt: string;
}

export type OkrStatus = "on_track" | "at_risk" | "off_track";

export interface OkrSummary {
  id: string;
  title: string;
  domain: DomainKey;
  progress: number;
  timeElapsed: number;
  score: number;
  status: OkrStatus;
}

export interface ProjectSummary {
  id: string;
  name: string;
  deliveryConfidence: number;
  overdueMilestones: number;
  criticalBlockers: number;
}

export interface NotificationSummary {
  id: string;
  domain: DomainKey;
  title: string;
  message: string;
  sev: Severity;
  read: boolean;
  createdAt: string;
}

export interface MonteCarloResult {
  p10: number;
  p50: number;
  p90: number;
}

export interface OrchestratorResult {
  generatedAt: string;
  domainHealth: Record<DomainKey, DomainHealth>;
  findings: Finding[];
  people: PersonSummary[];
  decisions: DecisionSummary[];
  scenarios: ScenarioSummary[];
  blockers: BlockerSummary[];
  hypotheses: HypothesisSummary[];
  okrs: OkrSummary[];
  projects: ProjectSummary[];
  criticalPath: string[];
  notifications: NotificationSummary[];
  monteCarlo: MonteCarloResult | null;
}
