// Part 31 compatibility: minimal stakeholder graph utilities. Edges are
// treated as undirected for "relationship distance" / hop-count purposes,
// which is what conflict-of-interest proximity warnings and the ethical
// lens's "stakeholders affected" section both need.

import { db } from "@/db";
import { stakeholderEdges, people } from "@/db/schema";

export interface GraphEdge {
  a: number;
  b: number;
}

async function loadEdges(): Promise<GraphEdge[]> {
  const rows = await db.select().from(stakeholderEdges);
  return rows.map((r) => ({ a: r.fromPersonId, b: r.toPersonId }));
}

/** BFS shortest path (hop count) between two people. Returns null if unreachable. */
export async function computeHops(fromId: number, toId: number): Promise<{ hops: number; path: number[] } | null> {
  if (fromId === toId) return { hops: 0, path: [fromId] };
  const edges = await loadEdges();
  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }

  const visited = new Set<number>([fromId]);
  const queue: Array<{ id: number; path: number[] }> = [{ id: fromId, path: [fromId] }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current.id) ?? [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      const path = [...current.path, n];
      if (n === toId) return { hops: path.length - 1, path };
      visited.add(n);
      queue.push({ id: n, path });
    }
  }
  return null;
}

/** All people within `maxHops` of a given person — used for "stakeholders affected". */
export async function peopleWithinHops(fromId: number, maxHops: number): Promise<Array<{ personId: number; hops: number }>> {
  const edges = await loadEdges();
  const adjacency = new Map<number, number[]>();
  for (const e of edges) {
    if (!adjacency.has(e.a)) adjacency.set(e.a, []);
    if (!adjacency.has(e.b)) adjacency.set(e.b, []);
    adjacency.get(e.a)!.push(e.b);
    adjacency.get(e.b)!.push(e.a);
  }
  const dist = new Map<number, number>([[fromId, 0]]);
  const queue = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    if (d >= maxHops) continue;
    for (const n of adjacency.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  dist.delete(fromId);
  return [...dist.entries()].map(([personId, hops]) => ({ personId, hops }));
}

export async function getPerson(personId: number) {
  const [row] = await db.select().from(people).where(eqId(personId));
  return row ?? null;
}

// small helper kept local to avoid importing drizzle's eq twice at call sites
import { eq } from "drizzle-orm";
function eqId(id: number) {
  return eq(people.id, id);
}
