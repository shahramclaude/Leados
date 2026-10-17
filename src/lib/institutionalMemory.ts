// js/institutional_memory.js (requested module) -> src/lib/institutionalMemory.ts.
// A persisted log of past findings/decisions plus simple similarity lookup,
// so a recurring pattern can be recognized against what happened last time.

import type { Finding, IncidentRecord } from "./types";

export function recordIncident(finding: Finding, note: string): IncidentRecord {
  return {
    id: `INC-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    at: Date.now(),
    findingId: finding.id,
    category: finding.category,
    severity: finding.severity,
    ruleIds: finding.ruleIds,
    note,
  };
}

/** Jaccard similarity over shared rule IDs + same category bonus. */
export function similarityScore(a: IncidentRecord, b: Finding): number {
  const setA = new Set(a.ruleIds);
  const setB = new Set(b.ruleIds);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size || 1;
  const jaccard = intersection / union;
  const categoryBonus = a.category === b.category ? 0.2 : 0;
  return Math.min(1, jaccard + categoryBonus);
}

export function findSimilarIncidents(incidents: IncidentRecord[], finding: Finding, limit = 3): IncidentRecord[] {
  return [...incidents]
    .map((inc) => ({ inc, score: similarityScore(inc, finding) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.inc);
}

export function memorySummary(incidents: IncidentRecord[]): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const inc of incidents) counts.set(inc.category, (counts.get(inc.category) ?? 0) + 1);
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}
