import { mulberry32, seededInt } from "./prng";
import type { AppState, Competitor, Initiative, LifeStageDimension, Stakeholder } from "./types";
import { LIFE_STAGE_DIMENSIONS } from "./types";

const SEED = 20251017;

export function buildSeedState(): AppState {
  const rng = mulberry32(SEED);

  const lifeStage = {} as Record<LifeStageDimension, number>;
  LIFE_STAGE_DIMENSIONS.forEach(({ key }) => {
    lifeStage[key] = seededInt(rng, 35, 85);
  });

  const stakeholders: Stakeholder[] = [
    { id: "s1", name: "Dana Ruiz", role: "Board Chair", power: 95, interest: 70, stance: 20 },
    { id: "s2", name: "Imani Okafor", role: "CFO", power: 80, interest: 90, stance: 10 },
    { id: "s3", name: "Theo Lindqvist", role: "VP Engineering", power: 55, interest: 85, stance: 40 },
    { id: "s4", name: "Priya Nair", role: "Lead Customer", power: 40, interest: 60, stance: -10 },
    { id: "s5", name: "Marcus Webb", role: "Union Rep", power: 60, interest: 75, stance: -30 },
    { id: "s6", name: "Elena Soto", role: "Lead Investor", power: 85, interest: 55, stance: 15 },
  ];

  const initiatives: Initiative[] = [
    { id: "i1", name: "Core platform reliability", horizon: 1, investment: 400, riskScore: 20, expectedReturn: 650 },
    { id: "i2", name: "Pricing & packaging overhaul", horizon: 1, investment: 150, riskScore: 35, expectedReturn: 300 },
    { id: "i3", name: "Adjacent vertical expansion", horizon: 2, investment: 600, riskScore: 55, expectedReturn: 900 },
    { id: "i4", name: "Partner ecosystem", horizon: 2, investment: 250, riskScore: 50, expectedReturn: 400 },
    { id: "i5", name: "AI-native product bet", horizon: 3, investment: 500, riskScore: 80, expectedReturn: 2200 },
    { id: "i6", name: "New category exploration", horizon: 3, investment: 120, riskScore: 85, expectedReturn: 600 },
  ];

  const competitors: Competitor[] = [
    { id: "c1", name: "Meridian Corp", archetype: "incumbent", pricingAggression: 35, hiringVelocity: 30, productVelocity: 40, sentiment: 10 },
    { id: "c2", name: "Northfork AI", archetype: "disruptor", pricingAggression: 70, hiringVelocity: 85, productVelocity: 90, sentiment: 55 },
    { id: "c3", name: "Vantage Systems", archetype: "fast-follower", pricingAggression: 55, hiringVelocity: 50, productVelocity: 60, sentiment: 5 },
    { id: "c4", name: "Harbor & Finch", archetype: "niche-player", pricingAggression: 20, hiringVelocity: 15, productVelocity: 35, sentiment: 30 },
  ];

  return {
    lifeStage,
    stakeholders,
    initiatives,
    competitors,
    adkar: { awareness: 70, desire: 45, knowledge: 60, ability: 50, reinforcement: 35 },
    realOptions: { pv: 1800, cost: 1200, years: 3, volatility: 0.45, riskFreeRate: 0.04 },
    orgDesign: { headcount: 240, layers: 5, avgSpan: 7 },
    executivePresence: { gravitas: 68, communication: 72, appearance: 64 },
    wargame: { ourPosture: "collaborative", competitorArchetype: "disruptor", marketVolatility: 55 },
  };
}
