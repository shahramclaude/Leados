// ─────────────────────────────────────────────────────────────────────────
// Causal chain detection
//
// For a directed pair A -> B with a maximum lag window, we estimate the
// empirical conditional frequency P(B occurs within the window | A occurs)
// as a maximum-likelihood estimate: occurrences / count(A). Two-step edges
// that clear a configurable frequency threshold are then composed into
// three-step chains A -> B -> C by chaining any two edges that share a
// middle event type, applying the Markov chain-rule approximation:
//   P(C within window2 after B | A) ≈ P(B within window1 | A) * P(C within window2 | B)
// which holds exactly when B is a sufficient statistic for A's influence on
// C (the first-order Markov assumption for event sequences).
// ─────────────────────────────────────────────────────────────────────────

import { daysBetween, round } from "./temporal";
import type { CausalChain, EventType, LeadosEvent } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ChainDefinition {
  from: EventType;
  to: EventType;
  maxLagDays: number;
}

/** Hard-coded minimum chain definitions required by the product spec. */
export const REQUIRED_CHAINS: ChainDefinition[] = [
  { from: "decision.escalate", to: "ops.incident", maxLagDays: 7 },
  { from: "engagement.decline", to: "hr.attrition", maxLagDays: 30 },
  { from: "pipeline.thin", to: "fin.runway.drop", maxLagDays: 60 },
];

/** Minimum empirical frequency for a chain to be reported as "detected". */
export const DEFAULT_FREQUENCY_THRESHOLD = 0.2;

/** Default lag window (days) used when discovering chains beyond the hard-coded set. */
export const DEFAULT_DISCOVERY_LAG_DAYS = 30;

export interface EdgeStats {
  occurrences: number;
  fromCount: number;
  avgLagDays: number;
  /** Empirical P(to within window | from). */
  confidence: number;
}

/**
 * Core pairwise detector. For every `from` event, scan forward up to
 * `maxLagDays` for the next matching `to` event (scoped to the same person
 * when both carry a personId) and record the lag.
 */
export function detectEdge(events: LeadosEvent[], def: ChainDefinition): EdgeStats {
  const froms = events.filter((e) => e.type === def.from).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const tos = events.filter((e) => e.type === def.to).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  let occurrences = 0;
  let lagSum = 0;

  for (const from of froms) {
    const windowEndMs = from.occurredAt.getTime() + def.maxLagDays * DAY_MS;
    const match = tos.find((to) => {
      if (to.occurredAt.getTime() < from.occurredAt.getTime()) return false;
      if (to.occurredAt.getTime() > windowEndMs) return false;
      if (from.personId !== null && to.personId !== null) return from.personId === to.personId;
      return true;
    });
    if (match) {
      occurrences += 1;
      lagSum += daysBetween(from.occurredAt, match.occurredAt);
    }
  }

  const fromCount = froms.length;
  return {
    occurrences,
    fromCount,
    avgLagDays: occurrences > 0 ? round(lagSum / occurrences, 1) : 0,
    confidence: fromCount > 0 ? round(occurrences / fromCount, 3) : 0,
  };
}

export interface DetectCausalChainsOptions {
  thresholdFrequency?: number;
  extraDefinitions?: ChainDefinition[];
  discoveryLagDays?: number;
}

/**
 * Detect causal chains across the event log: the hard-coded two-step
 * definitions (always evaluated and returned, even with zero evidence, so
 * the product's required chains are always visible), any additional
 * two-step edges discovered among observed event types that clear the
 * frequency threshold, and three-step compositions of edges that share a
 * middle node.
 */
export function detectCausalChains(events: LeadosEvent[], options: DetectCausalChainsOptions = {}): CausalChain[] {
  const threshold = options.thresholdFrequency ?? DEFAULT_FREQUENCY_THRESHOLD;
  const discoveryLag = options.discoveryLagDays ?? DEFAULT_DISCOVERY_LAG_DAYS;
  const defs = [...REQUIRED_CHAINS, ...(options.extraDefinitions ?? [])];

  const chains: CausalChain[] = [];
  const edgeIndex = new Map<string, EdgeStats & { def: ChainDefinition }>();

  const addEdge = (def: ChainDefinition, stats: EdgeStats) => {
    edgeIndex.set(`${def.from}>${def.to}`, { ...stats, def });
  };

  for (const def of defs) {
    const stats = detectEdge(events, def);
    addEdge(def, stats);
    chains.push({
      path: [def.from, def.to],
      avgLagDays: stats.avgLagDays,
      occurrences: stats.occurrences,
      nextLikely: def.to,
      confidence: stats.confidence,
    });
  }

  const observedTypes = Array.from(new Set(events.map((e) => e.type)));
  for (const from of observedTypes) {
    for (const to of observedTypes) {
      if (from === to) continue;
      const key = `${from}>${to}`;
      if (edgeIndex.has(key)) continue;
      const def: ChainDefinition = { from, to, maxLagDays: discoveryLag };
      const stats = detectEdge(events, def);
      if (stats.fromCount > 0 && stats.confidence > threshold) {
        addEdge(def, stats);
        chains.push({
          path: [from, to],
          avgLagDays: stats.avgLagDays,
          occurrences: stats.occurrences,
          nextLikely: to,
          confidence: stats.confidence,
        });
      }
    }
  }

  const edgeList = Array.from(edgeIndex.values());
  for (const first of edgeList) {
    if (first.confidence <= threshold) continue;
    for (const second of edgeList) {
      if (second.confidence <= threshold) continue;
      if (first.def.to !== second.def.from) continue;
      if (first.def.from === second.def.to) continue; // skip trivial A -> B -> A cycles
      chains.push({
        path: [first.def.from, first.def.to, second.def.to],
        avgLagDays: round(first.avgLagDays + second.avgLagDays, 1),
        occurrences: Math.min(first.occurrences, second.occurrences),
        nextLikely: second.def.to,
        confidence: round(first.confidence * second.confidence, 3),
      });
    }
  }

  return chains;
}
