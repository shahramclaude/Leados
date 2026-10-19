// Client-side mirrors of the JSON shapes returned by the API routes.
// Dates come back from `Response.json` as ISO strings, not `Date`
// instances, which is why these types differ slightly from the
// Drizzle row types used on the server.

export type PersonRow = {
  id: number;
  name: string;
  role: string;
  department: string;
  managerId: number | null;
  performanceScore: number;
  potentialScore: number;
  flightRiskScore: number;
  burnoutRiskScore: number;
  tenureMonths: number;
  skills: string[];
  isCritical: boolean;
  createdAt: string;
};

export type FindingRow = {
  id: number;
  title: string;
  domain: string;
  severity: string;
  tags: string[];
  description: string;
  status: string;
  createdAt: string;
};

export type HypothesisRow = {
  id: number;
  entity: string;
  claim: string;
  resolveBy: string;
  status: "open" | "confirmed" | "refuted";
  confidence: number;
  ruleId: number | null;
  createdAt: string;
};

export type ProjectRow = {
  id: number;
  name: string;
  status: string;
  durationDays: number;
  dependencies: number[];
  ownerId: number | null;
  deliveryConfidence: number;
  createdAt: string;
};

export type PlaybookInstanceRow = {
  id: number;
  playbookId: number;
  findingId: number;
  status: string;
  createdAt: string;
};

export type CriticalPathResultJson = {
  order: number[];
  chain: number[];
  totalDurationDays: number;
  bottleneckProject: number | null;
  cyclesDetected: number[][];
};

export type RunwayResultJson = {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p50RunwayMonths: number;
  mean: number;
  samples: number;
};

export type MorningBriefJson = {
  executiveSummary: string;
  sentenceCount: number;
  topRisks: string[];
  generatedAt: string;
};

export type CockpitData = {
  people: PersonRow[];
  findings: FindingRow[];
  hypotheses: HypothesisRow[];
  projects: ProjectRow[];
  playbookInstances: PlaybookInstanceRow[];
  lastAgentRun: { id: number; startedAt: string; completedAt: string; durationMs: number; status: string } | null;
  belief: { nodes: readonly string[]; posteriors: Record<string, number>; cascadeRisk: number };
  criticalPath: CriticalPathResultJson;
  runway: RunwayResultJson;
  brief: MorningBriefJson;
  summary: {
    peopleCount: number;
    atRiskPeopleCount: number;
    openFindingsCount: number;
    openHypothesesCount: number;
    projectsCount: number;
  };
};
