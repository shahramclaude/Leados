// ---------------------------------------------------------------------------
// beliefFabric.ts — lightweight belief store.
//
// "Beliefs" are confidence-weighted running estimates derived from
// observables emitted by various subsystems (e.g. the Metrics Intelligence
// pipeline's composite domain scores). Each new observation is blended into
// the existing belief using a confidence-weighted moving average, and the
// belief's confidence itself decays toward the new observation's confidence.
//
// This module is process-local (in-memory) — intended as the integration
// seam referenced by Part 9 ("feed composite scores to beliefFabric
// observables"), not a full persistence layer.
// ---------------------------------------------------------------------------

export interface Observable {
  key: string;
  value: number;
  confidence: number; // 0..1
  source: string;
  observedAt: Date;
}

export interface Belief {
  key: string;
  value: number;
  confidence: number;
  lastUpdated: Date;
  sources: string[];
}

const beliefs = new Map<string, Belief>();

/**
 * Blend a new observable into the existing belief for `observable.key`.
 * Uses a confidence-weighted average: higher-confidence observations move
 * the belief further. If no prior belief exists, the observable becomes the
 * belief outright.
 */
export function updateBelief(observable: Observable): Belief {
  const existing = beliefs.get(observable.key);

  if (!existing) {
    const belief: Belief = {
      key: observable.key,
      value: observable.value,
      confidence: observable.confidence,
      lastUpdated: observable.observedAt,
      sources: [observable.source],
    };
    beliefs.set(observable.key, belief);
    return belief;
  }

  const totalWeight = existing.confidence + observable.confidence;
  const blendedValue =
    totalWeight === 0
      ? observable.value
      : (existing.value * existing.confidence +
          observable.value * observable.confidence) /
        totalWeight;

  const blendedConfidence = Math.min(
    1,
    Math.max(existing.confidence, observable.confidence) * 0.6 +
      Math.min(existing.confidence, observable.confidence) * 0.4,
  );

  const belief: Belief = {
    key: observable.key,
    value: blendedValue,
    confidence: blendedConfidence,
    lastUpdated: observable.observedAt,
    sources: Array.from(new Set([...existing.sources, observable.source])).slice(-5),
  };

  beliefs.set(observable.key, belief);
  return belief;
}

export function ingestObservables(observables: Observable[]): Belief[] {
  return observables.map(updateBelief);
}

export function getBelief(key: string): Belief | undefined {
  return beliefs.get(key);
}

export function getAllBeliefs(): Belief[] {
  return Array.from(beliefs.values());
}

export function clearBeliefs(): void {
  beliefs.clear();
}
