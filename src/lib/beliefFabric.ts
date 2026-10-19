// src/lib/beliefFabric.ts (Part 1 prerequisite)
// Belief Fabric: a lightweight latent-state / causal-inference layer that
// turns raw metrics + events into an organizational belief state.
//
// Exported: LatentNode, UncertaintyFlag, CausalChain, BeliefFabricResult,
//           computeBeliefFabric (line ~70)

import type { MetricValue, LeadosEvent, MetricKey } from './types';
import type { Decision } from './decisionTypes';

export interface LatentNode {
  id: string;
  name: string;
  domain: string;
  /** 0-1 model confidence in this node's current estimated state */
  confidence: number;
  signalDescription: string;
  state: 'healthy' | 'at_risk' | 'critical';
}

export interface UncertaintyFlag {
  node: string;
  confidence: number;
  signalDescription: string;
}

export interface CausalChain {
  id: string;
  description: string;
  confidence: number;
  chain: string[];
}

export interface DominantRisk {
  label: string;
  domain: string;
  severity: number; // 0-100
}

export interface CascadeRiskEstimate {
  p: number;
  description: string;
}

export interface BeliefFabricResult {
  orgHealthScore: number; // 0-100
  dominantRisk: DominantRisk;
  latentNodes: LatentNode[];
  uncertaintyFlags: UncertaintyFlag[];
  causalChains: CausalChain[];
  cascadeRisk: CascadeRiskEstimate;
}

const LATENT_NODE_SEEDS: Array<{ id: string; name: string; domain: string; signalDescription: string }> = [
  { id: 'customer_trust', name: 'Customer Trust', domain: 'revenue', signalDescription: 'support ticket sentiment' },
  { id: 'team_morale', name: 'Team Morale', domain: 'people', signalDescription: 'eNPS / exit interview' },
  { id: 'product_momentum', name: 'Product Momentum', domain: 'product', signalDescription: 'feature adoption telemetry' },
  { id: 'capital_runway', name: 'Capital Runway Confidence', domain: 'capital', signalDescription: 'burn multiple / cohort LTV' },
  { id: 'competitive_pressure', name: 'Competitive Pressure', domain: 'gtm', signalDescription: 'win/loss call notes' },
  { id: 'operational_debt', name: 'Operational Debt', domain: 'operations', signalDescription: 'incident / SLA logs' },
];

function latestValue(metrics: MetricValue[], key: MetricKey): number | null {
  const rows = metrics.filter((m) => m.metricKey === key).sort((a, b) => a.date.localeCompare(b.date));
  return rows.length ? rows[rows.length - 1].value : null;
}

export function computeBeliefFabric(
  metrics: MetricValue[],
  events: LeadosEvent[],
  decisions: Decision[] = [],
): BeliefFabricResult {
  void decisions.length; // reserved for future decision-aware belief weighting
  const churn = latestValue(metrics, 'churnRate') ?? 3;
  const nps = latestValue(metrics, 'nps') ?? 30;
  const runway = latestValue(metrics, 'runwayMonths') ?? 18;
  const pipeline = latestValue(metrics, 'pipelineCoverage') ?? 3;
  const burn = latestValue(metrics, 'burnRate') ?? 250000;
  const revenue = latestValue(metrics, 'revenue') ?? 500000;

  const recentEvents14d = events.filter((e) => daysAgo(e.timestamp) <= 14);
  const competitiveSignals = recentEvents14d.filter((e) =>
    ['competitive.signal', 'market.move', 'talent.poach', 'customer.churn.to_competitor', 'pricing.pressure'].includes(e.type),
  ).length;

  const latentNodes: LatentNode[] = LATENT_NODE_SEEDS.map((seed) => {
    let state: LatentNode['state'] = 'healthy';
    let confidence = 0.72;

    if (seed.id === 'customer_trust') {
      state = churn > 5 ? 'critical' : churn > 3 ? 'at_risk' : 'healthy';
      confidence = 0.68;
    } else if (seed.id === 'team_morale') {
      const attrition = recentEvents14d.filter((e) => e.type === 'talent.poach').length;
      state = attrition >= 2 ? 'at_risk' : 'healthy';
      confidence = 0.55; // morale is hard to observe directly -> lower confidence
    } else if (seed.id === 'product_momentum') {
      state = nps < 20 ? 'at_risk' : 'healthy';
      confidence = 0.74;
    } else if (seed.id === 'capital_runway') {
      state = runway < 9 ? 'critical' : runway < 15 ? 'at_risk' : 'healthy';
      confidence = 0.81;
    } else if (seed.id === 'competitive_pressure') {
      state = competitiveSignals >= 3 ? 'critical' : competitiveSignals >= 1 ? 'at_risk' : 'healthy';
      confidence = 0.6;
    } else if (seed.id === 'operational_debt') {
      state = pipeline < 2 ? 'at_risk' : 'healthy';
      confidence = 0.5; // least-observed node on purpose, surfaces in confidenceStatement
    }

    return { ...seed, state, confidence };
  });

  const riskWeights: Record<LatentNode['state'], number> = { healthy: 0, at_risk: 14, critical: 28 };
  const healthPenalty = latentNodes.reduce((sum, n) => sum + riskWeights[n.state] * (1 - n.confidence * 0.3), 0);
  const orgHealthScore = Math.max(5, Math.min(98, Math.round(92 - healthPenalty)));

  const worst = [...latentNodes].sort((a, b) => riskWeights[b.state] - riskWeights[a.state])[0];
  const dominantRisk: DominantRisk = {
    label: worst.name,
    domain: worst.domain,
    severity: riskWeights[worst.state] === 28 ? 86 : riskWeights[worst.state] === 14 ? 54 : 18,
  };

  const uncertaintyFlags: UncertaintyFlag[] = latentNodes
    .filter((n) => n.confidence < 0.7)
    .map((n) => ({ node: n.name, confidence: n.confidence, signalDescription: n.signalDescription }));

  const causalChains: CausalChain[] = [];
  if (churn > 4 && nps < 25) {
    causalChains.push({
      id: 'churn_nps_chain',
      description: 'Declining product satisfaction (NPS) is the leading indicator feeding elevated churn, which compounds into revenue drag.',
      confidence: 0.77,
      chain: ['product_momentum', 'customer_trust', 'revenue'],
    });
  }
  if (competitiveSignals >= 1 && churn > 3) {
    causalChains.push({
      id: 'competitive_churn_chain',
      description: 'Competitive pressure events correlate with the recent uptick in churn, suggesting customers are being actively won away rather than lapsing organically.',
      confidence: 0.64,
      chain: ['competitive_pressure', 'customer_trust', 'revenue'],
    });
  }
  if (burn > revenue * 0.6 && runway < 15) {
    causalChains.push({
      id: 'burn_runway_chain',
      description: 'Burn rate relative to revenue is compressing runway faster than the baseline plan assumed.',
      confidence: 0.82,
      chain: ['capital_runway'],
    });
  }
  if (causalChains.length === 0) {
    causalChains.push({
      id: 'stable_chain',
      description: 'No strong causal degradation chain detected; metrics are moving within modeled tolerances.',
      confidence: 0.58,
      chain: ['product_momentum'],
    });
  }

  const cascadeRisk: CascadeRiskEstimate = {
    p: Math.min(0.9, Math.max(0.05, (riskWeights[worst.state] / 28) * 0.6 + competitiveSignals * 0.08)),
    description: 'Probability that the dominant risk cascades into an adjacent domain within one quarter.',
  };

  return { orgHealthScore, dominantRisk, latentNodes, uncertaintyFlags, causalChains, cascadeRisk };
}

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}
