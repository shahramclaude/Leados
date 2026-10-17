// Shared types for the Organizational Intelligence Platform (OIP).
// Original to this delivery — see AI-SESSION-LOG.md for provenance of the
// module list this implements (pasted "pt-O"/"pt-P" spec, unverified against
// github.com/wbweve/Leados as of this session's inspection).

export type LifeStageDimension =
  | "strategyClarity"
  | "leadershipBench"
  | "processDiscipline"
  | "financialControl"
  | "customerInsight"
  | "productMarketFit"
  | "talentDensity"
  | "cultureCohesion"
  | "riskManagement"
  | "dataAndSystems"
  | "governance"
  | "innovationCapacity";

export const LIFE_STAGE_DIMENSIONS: { key: LifeStageDimension; label: string }[] = [
  { key: "strategyClarity", label: "Strategy Clarity" },
  { key: "leadershipBench", label: "Leadership Bench" },
  { key: "processDiscipline", label: "Process Discipline" },
  { key: "financialControl", label: "Financial Control" },
  { key: "customerInsight", label: "Customer Insight" },
  { key: "productMarketFit", label: "Product-Market Fit" },
  { key: "talentDensity", label: "Talent Density" },
  { key: "cultureCohesion", label: "Culture Cohesion" },
  { key: "riskManagement", label: "Risk Management" },
  { key: "dataAndSystems", label: "Data & Systems" },
  { key: "governance", label: "Governance" },
  { key: "innovationCapacity", label: "Innovation Capacity" },
];

export type Posture = "aggressive" | "defensive" | "collaborative" | "niche";
export type CompetitorArchetype = "incumbent" | "disruptor" | "fast-follower" | "niche-player";

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  power: number; // 0-100
  interest: number; // 0-100
  stance: number; // -100 (opposed) .. 100 (champion)
}

export interface Initiative {
  id: string;
  name: string;
  horizon: 1 | 2 | 3;
  investment: number; // $k
  riskScore: number; // 0-100
  expectedReturn: number; // $k
}

export interface Competitor {
  id: string;
  name: string;
  archetype: CompetitorArchetype;
  pricingAggression: number; // 0-100
  hiringVelocity: number; // 0-100
  productVelocity: number; // 0-100
  sentiment: number; // -100..100
}

export interface AdkarState {
  awareness: number;
  desire: number;
  knowledge: number;
  ability: number;
  reinforcement: number;
}

export interface RealOptionsInputs {
  pv: number; // present value of expected cash flows ($k) -> S
  cost: number; // cost to invest / exercise price ($k) -> K
  years: number; // time to expiry (T, years)
  volatility: number; // sigma, 0-1
  riskFreeRate: number; // r, 0-1
}

export interface OrgDesignInputs {
  headcount: number;
  layers: number;
  avgSpan: number;
}

export interface ExecutivePresenceInputs {
  gravitas: number;
  communication: number;
  appearance: number;
}

export interface WargameInputs {
  ourPosture: Posture;
  competitorArchetype: CompetitorArchetype;
  marketVolatility: number; // 0-100
}

export interface AppState {
  lifeStage: Record<LifeStageDimension, number>;
  stakeholders: Stakeholder[];
  initiatives: Initiative[];
  competitors: Competitor[];
  adkar: AdkarState;
  realOptions: RealOptionsInputs;
  orgDesign: OrgDesignInputs;
  executivePresence: ExecutivePresenceInputs;
  wargame: WargameInputs;
}
