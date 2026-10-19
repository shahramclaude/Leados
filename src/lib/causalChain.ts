// src/lib/causalChain.ts
//
// BOOTSTRAP NOTE: no prior causalChain.ts existed in the repository.
// Original-derivation first-order Markov chain edge detection over each
// entity's (person/team) event-type sequence, ordered by time.

import type { CausalEdge, LeadosEvent } from "./types";
import { daysBetween } from "./temporal";

/** DESIGN PARAMETER: two consecutive events for the same entity are only
 * considered a causal transition if they occur within this many days of
 * each other (otherwise treated as unrelated sequences).
 */
const MAX_TRANSITION_GAP_DAYS = 14;
/** DESIGN PARAMETER: minimum number of observed transitions before an edge
 * is reported (avoids reporting noise from a single coincidence). */
const MIN_SUPPORT = 3;
/** DESIGN PARAMETER: minimum empirical transition probability to report. */
const MIN_PROBABILITY = 0.4;

function entityKey(event: LeadosEvent): string | null {
  return event.personId ?? event.teamId ?? event.projectId ?? null;
}

export function detectCausalChains(events: LeadosEvent[], now: Date): CausalEdge[] {
  void now; // reserved for future recency-weighting of transitions

  const byEntity = new Map<string, LeadosEvent[]>();
  for (const event of events) {
    const key = entityKey(event);
    if (!key) continue;
    const list = byEntity.get(key) ?? [];
    list.push(event);
    byEntity.set(key, list);
  }

  const transitionCounts = new Map<string, Map<string, number>>();
  const fromTotals = new Map<string, number>();

  for (const entityEvents of byEntity.values()) {
    const sorted = [...entityEvents].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      if (from.type === to.type) continue;
      const gap = daysBetween(from.occurredAt, to.occurredAt);
      if (gap < 0 || gap > MAX_TRANSITION_GAP_DAYS) continue;

      const toMap = transitionCounts.get(from.type) ?? new Map<string, number>();
      toMap.set(to.type, (toMap.get(to.type) ?? 0) + 1);
      transitionCounts.set(from.type, toMap);
      fromTotals.set(from.type, (fromTotals.get(from.type) ?? 0) + 1);
    }
  }

  const edges: CausalEdge[] = [];
  for (const [from, toMap] of transitionCounts.entries()) {
    const total = fromTotals.get(from) ?? 0;
    for (const [to, support] of toMap.entries()) {
      const probability = total > 0 ? support / total : 0;
      if (support >= MIN_SUPPORT && probability >= MIN_PROBABILITY) {
        edges.push({ from, to, probability, support });
      }
    }
  }

  return edges.sort((a, b) => b.probability - a.probability);
}
