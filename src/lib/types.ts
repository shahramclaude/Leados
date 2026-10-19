// src/lib/types.ts
// Shared metric / event / scenario primitives used across the strategic layer.

export type MetricKey =
  | 'revenue'
  | 'churnRate'
  | 'cac'
  | 'burnRate'
  | 'runwayMonths'
  | 'nps'
  | 'headcount'
  | 'pipelineCoverage'
  | 'conversionRate'
  | 'grossMargin'
  | 'productUsage';

export const ALL_METRIC_KEYS: MetricKey[] = [
  'revenue',
  'churnRate',
  'cac',
  'burnRate',
  'runwayMonths',
  'nps',
  'headcount',
  'pipelineCoverage',
  'conversionRate',
  'grossMargin',
  'productUsage',
];

export interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  direction: 'higher_better' | 'lower_better';
}

export interface MetricValue {
  metricKey: MetricKey;
  date: string; // ISO date
  value: number;
}

export interface LeadosEvent {
  id: string;
  type: string;
  timestamp: string; // ISO date
  description?: string;
  payload?: Record<string, unknown>;
}

export interface SavedScenario {
  id: string;
  name: string;
  metricKey: MetricKey;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Part 4 — Strategic War Room shared types
// ---------------------------------------------------------------------------

import type { ScenarioResult } from './scenarioEngine';
import type { Move, RoundScore } from './wargameEngine';
import type { Decision, DecisionDomain } from './decisionTypes';

export type Urgency = 'watch' | 'plan' | 'act';

export interface ActivatedScenario {
  metricKey: MetricKey;
  actualValue: number;
  baselineValue: number;
  deviationSigmas: number;
  trendPerMonth: number;
  projection: ScenarioResult;
  implication: string;
  urgency: Urgency;
}

export interface WargameAutoResult {
  trigger: string[];
  ourBestMove: Move;
  competitorCounters: Record<string, Move>;
  roundScores: Record<string, RoundScore>;
  blindspots: string[];
  recommendation: string;
}

export interface StrategicRisk {
  title: string;
  domain: DecisionDomain | string;
  severity: number; // 0-100
  confidence: number; // 0-1
  implication: string;
}

export interface BoardDecision {
  id: string;
  title: string;
  domain: DecisionDomain;
  stakes: string;
  options: string[];
  recommendation: string;
  deadline: string;
  optionValue: number | null;
}

export interface BoardIntelligencePack {
  executiveSummary: string;
  organizationalMoment: string;
  domainHealthNarrative: string;
  top3StrategicRisks: StrategicRisk[];
  activatedScenarios: ActivatedScenario[];
  decisionsForBoard: BoardDecision[];
  keyMetricTableHTML: string;
  wargameInsight: string | null;
  confidenceStatement: string;
  generatedAt: string;
}

export interface MetricSurveillanceEntry {
  metricKey: MetricKey;
  actualValue: number;
  baselineValue: number;
  deviationSigmas: number;
  trendPerMonth: number;
  urgency: Urgency;
}

export interface StrategicIntelligenceReport {
  activatedScenarios: ActivatedScenario[];
  metricSurveillance: MetricSurveillanceEntry[];
  wargameAutoResult: WargameAutoResult | null;
  boardPack: BoardIntelligencePack;
  generatedAt: string;
}

export interface StrategicIntelligenceInputLike {
  decisions: Decision[];
  metrics: MetricValue[];
  metricDefs: MetricDef[];
  events: LeadosEvent[];
  existingScenarios: SavedScenario[];
  now: Date;
}
