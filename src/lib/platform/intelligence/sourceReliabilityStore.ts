/**
 * sourceReliabilityStore.ts — Part 04-C stateful wrapper: persists each
 * evidence source's resolved-prediction history and recomputes reliability
 * (via the pure `computeSourceReliability` in the domain layer) whenever a
 * prediction resolves. This is what `beliefStore.ts` and `ruleEngine`
 * consult for `wᵢ = reliability(sourceᵢ)` in log-odds pooling.
 */

import { computeSourceReliability } from "../../domain/intelligence/sourceReliability";
import type { ResolvedPrediction, SourceReliabilityRecord } from "../../domain/intelligence/types";
import { eventLog } from "./eventLog";

class SourceReliabilityStore {
  private history = new Map<string, ResolvedPrediction[]>();

  /** Record that a source's probability estimate `p` has now resolved to a
   * known binary `outcome` (e.g. the flight-risk prediction window closed).
   * Appends an audit event and returns the freshly recomputed reliability. */
  resolve(sourceId: string, p: number, outcome: 0 | 1, resolvedAt: string): SourceReliabilityRecord {
    const existing = this.history.get(sourceId) ?? [];
    const updated = [...existing, { p, outcome, resolvedAt }];
    this.history.set(sourceId, updated);
    const record = computeSourceReliability(sourceId, updated);
    eventLog.append("source.reliability.resolved", { sourceId, p, outcome, record });
    return record;
  }

  get(sourceId: string): SourceReliabilityRecord {
    return computeSourceReliability(sourceId, this.history.get(sourceId) ?? []);
  }

  all(): SourceReliabilityRecord[] {
    return [...this.history.keys()].map((id) => this.get(id));
  }

  resetForTests() {
    this.history.clear();
  }
}

export const sourceReliabilityStore = new SourceReliabilityStore();
