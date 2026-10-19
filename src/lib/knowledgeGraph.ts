import type { GraphEdge, GraphNode, InstitutionalPattern, RuleEvaluation } from "@/lib/types";
import type { Domain } from "@/lib/types";
import { CAUSAL_LINKS } from "@/lib/causalInference";

// ─────────────────────────────────────────────────────────────────────────
// knowledgeGraph — causal graph construction, backward root-cause search,
// Jaccard pattern similarity, institutional memory digest, and a
// Fruchterman-Reingold force-directed layout.
// Cite: Fruchterman, T. M. J., & Reingold, E. M. (1991). "Graph Drawing by
// Force-directed Placement." Software: Practice and Experience, 21(11).
// ─────────────────────────────────────────────────────────────────────────

// DESIGN PARAMETER: confidence decays 0.9 per BFS hop away from the
// originating finding (self-test T27 checks 3 hops -> 0.9^3 = 0.729).
export const CONFIDENCE_DECAY_PER_HOP = 0.9;

export function buildGraphNodes(evaluations: RuleEvaluation[]): GraphNode[] {
  return evaluations.map((e, i) => ({
    id: e.ruleId,
    label: e.name,
    domain: e.domain,
    kind: "rule" as const,
    x: 0,
    y: 0,
  }));
}

export function buildGraphEdges(evaluations: RuleEvaluation[]): GraphEdge[] {
  const byId = new Map(evaluations.map((e) => [e.ruleId, e]));
  return CAUSAL_LINKS.map((link) => {
    const active = Boolean(byId.get(link.fromRuleId)?.firing && byId.get(link.toRuleId)?.firing);
    return { source: link.fromRuleId, target: link.toRuleId, active, weight: link.amplification };
  });
}

/**
 * Backward BFS from a rule id through the causal graph (edges reversed) to
 * find root causes — nodes with no further incoming causal edges. Guards
 * against cycles via a visited-node set so the search always terminates.
 * Each hop decays confidence by CONFIDENCE_DECAY_PER_HOP.
 */
export function findRootCauses(startRuleId: string): { ruleId: string; hops: number; confidence: number }[] {
  const reverseAdjacency = new Map<string, string[]>();
  for (const link of CAUSAL_LINKS) {
    reverseAdjacency.set(link.toRuleId, [...(reverseAdjacency.get(link.toRuleId) ?? []), link.fromRuleId]);
  }

  const visited = new Set<string>([startRuleId]);
  const queue: { id: string; hops: number }[] = [{ id: startRuleId, hops: 0 }];
  const roots: { ruleId: string; hops: number; confidence: number }[] = [];

  while (queue.length > 0) {
    const { id, hops } = queue.shift()!;
    const parents = reverseAdjacency.get(id) ?? [];
    if (parents.length === 0 && hops > 0) {
      roots.push({ ruleId: id, hops, confidence: Math.pow(CONFIDENCE_DECAY_PER_HOP, hops) });
      continue;
    }
    for (const parent of parents) {
      if (visited.has(parent)) continue; // cycle guard
      visited.add(parent);
      queue.push({ id: parent, hops: hops + 1 });
    }
  }
  if (roots.length === 0 && (reverseAdjacency.get(startRuleId) ?? []).length === 0) {
    roots.push({ ruleId: startRuleId, hops: 0, confidence: 1 });
  }
  return roots;
}

/** Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|. */
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export interface FiringSnapshot {
  ts: string;
  firingRuleIds: string[];
}

export function findSimilarPastPatterns(
  current: Set<string>,
  history: FiringSnapshot[],
  minSimilarity = 0.4
): { ts: string; similarity: number; overlap: string[] }[] {
  return history
    .map((h) => {
      const set = new Set(h.firingRuleIds);
      return { ts: h.ts, similarity: jaccard(current, set), overlap: [...current].filter((x) => set.has(x)) };
    })
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);
}

export function buildInstitutionalMemoryDigest(history: FiringSnapshot[], ruleDomain: Map<string, Domain>): InstitutionalPattern[] {
  const counts = new Map<string, { count: number; lastSeen: string }>();
  for (const snap of history) {
    for (const ruleId of snap.firingRuleIds) {
      const prev = counts.get(ruleId);
      counts.set(ruleId, { count: (prev?.count ?? 0) + 1, lastSeen: snap.ts });
    }
  }
  return [...counts.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([ruleId, v]) => ({
      pattern: ruleId,
      occurrences: v.count,
      domains: [ruleDomain.get(ruleId) ?? "execution"],
      lastSeen: v.lastSeen,
      confirmedRate: 0.5,
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Fruchterman-Reingold force-directed layout. DESIGN PARAMETER: area = 1,
 * k (optimal distance) = sqrt(area / nodeCount), iterations = 50, cooling
 * via linear temperature decay — matching the original 1991 paper's
 * simplified model.
 */
export function forceDirectedLayout(nodes: GraphNode[], edges: GraphEdge[], width = 900, height = 600): GraphNode[] {
  const n = nodes.length;
  if (n === 0) return nodes;
  const area = width * height;
  const k = Math.sqrt(area / n);
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    positions.set(node.id, { x: width / 2 + Math.cos(angle) * (width / 3), y: height / 2 + Math.sin(angle) * (height / 3) });
  });

  const iterations = 50;
  let temperature = width / 10;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, { x: number; y: number }>();
    nodes.forEach((v) => disp.set(v.id, { x: 0, y: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const v = nodes[i];
        const u = nodes[j];
        const pv = positions.get(v.id)!;
        const pu = positions.get(u.id)!;
        let dx = pv.x - pu.x;
        let dy = pv.y - pu.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const repulsive = (k * k) / dist;
        dx = (dx / dist) * repulsive;
        dy = (dy / dist) * repulsive;
        const dv = disp.get(v.id)!;
        const du = disp.get(u.id)!;
        disp.set(v.id, { x: dv.x + dx, y: dv.y + dy });
        disp.set(u.id, { x: du.x - dx, y: du.y - dy });
      }
    }

    for (const e of edges) {
      const pv = positions.get(e.source);
      const pu = positions.get(e.target);
      if (!pv || !pu) continue;
      let dx = pv.x - pu.x;
      let dy = pv.y - pu.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const attractive = (dist * dist) / k;
      dx = (dx / dist) * attractive;
      dy = (dy / dist) * attractive;
      const dv = disp.get(e.source)!;
      const du = disp.get(e.target)!;
      disp.set(e.source, { x: dv.x - dx, y: dv.y - dy });
      disp.set(e.target, { x: du.x + dx, y: du.y + dy });
    }

    for (const v of nodes) {
      const d = disp.get(v.id)!;
      const dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const p = positions.get(v.id)!;
      const limited = Math.min(dist, temperature);
      const nx = p.x + (d.x / dist) * limited;
      const ny = p.y + (d.y / dist) * limited;
      positions.set(v.id, {
        x: Math.max(30, Math.min(width - 30, nx)),
        y: Math.max(30, Math.min(height - 30, ny)),
      });
    }
    temperature *= 1 - iter / iterations;
  }

  return nodes.map((v) => ({ ...v, ...positions.get(v.id)! }));
}
