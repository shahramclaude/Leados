// src/lib/orgDesign.ts
//
// NEW MODULE standing in for the "Part 2" org design/structure analysis
// referenced by this brief (no prior file existed — see provenance note
// in src/lib/types.ts). Not directly consumed by any Part 3 deliverable
// (the brief only asked that it be read in full before writing, which
// is impossible since it never existed); kept small and self-contained
// so future parts can build on it without touching Part 3's surface.

import type { PersonId, PersonRecord } from "./types";

export interface SpanOfControlResult {
  managerId: PersonId;
  directReports: number;
}

/** 0 callers within Part 3; reserved for future org-design parts. */
export function computeSpanOfControl(people: PersonRecord[]): SpanOfControlResult[] {
  const counts = new Map<PersonId, number>();
  for (const p of people) {
    if (p.managerId == null) continue;
    counts.set(p.managerId, (counts.get(p.managerId) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([managerId, directReports]) => ({
    managerId,
    directReports,
  }));
}

/** 0 callers within Part 3; reserved for future org-design parts. */
export function computeLayerDepth(people: PersonRecord[], personId: PersonId): number {
  let depth = 0;
  let current = people.find((p) => p.id === personId);
  const visited = new Set<PersonId>();
  while (current?.managerId != null && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = people.find((p) => p.id === current!.managerId);
  }
  return depth;
}
