/**
 * src/lib/causal/graph.ts
 * Causal DAG utilities: ancestry/descendant queries, simple-path
 * enumeration, and an explicit, testable backdoor-criterion checker.
 *
 * This module is intentionally dependency-free and pure so it can be unit
 * tested against hand-built toy graphs (see scripts/backdoorTests.ts),
 * including a collider case that MUST be refused.
 */
import type { CausalGraph } from "./types";

/** All direct parents of a node (edges pointing into it). */
export function parentsOf(graph: CausalGraph, node: string): string[] {
  return graph.edges.filter((e) => e.to === node).map((e) => e.from);
}

/** All direct children of a node (edges pointing out of it). */
export function childrenOf(graph: CausalGraph, node: string): string[] {
  return graph.edges.filter((e) => e.from === node).map((e) => e.to);
}

/** All descendants of a node (transitive children), excluding the node itself. */
export function descendantsOf(graph: CausalGraph, node: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...childrenOf(graph, node)];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...childrenOf(graph, n));
  }
  return seen;
}

/** All ancestors of a node (transitive parents), excluding the node itself. */
export function ancestorsOf(graph: CausalGraph, node: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...parentsOf(graph, node)];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...parentsOf(graph, n));
  }
  return seen;
}

export interface GraphPath {
  nodes: string[];
  /** For each internal node (index 1..len-2), whether it is a collider on this path. */
  colliders: boolean[];
  /** True if the first edge (adjacent to path start) has its arrowhead pointing into the start node. */
  startsWithArrowIntoFirst: boolean;
}

/**
 * Enumerate all simple (no repeated node) undirected paths between `from`
 * and `to` in the graph, tracking edge directions so callers can classify
 * colliders and backdoor paths. Graphs in this product are small (causal
 * diagrams a human can read), so exhaustive DFS is appropriate.
 */
export function enumerateSimplePaths(graph: CausalGraph, from: string, to: string): GraphPath[] {
  const adj = new Map<string, { other: string; arrowFromThisIntoOther: boolean }[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.from)?.push({ other: e.to, arrowFromThisIntoOther: true });
    adj.get(e.to)?.push({ other: e.from, arrowFromThisIntoOther: false });
  }

  const results: GraphPath[] = [];
  const visited = new Set<string>([from]);
  const pathNodes: string[] = [from];
  // arrowIntoStep[i] = true if edge between pathNodes[i] and pathNodes[i+1] points INTO pathNodes[i+1]
  const arrowIntoStep: boolean[] = [];

  function dfs(current: string) {
    if (current === to && pathNodes.length > 1) {
      const colliders: boolean[] = [];
      for (let i = 1; i < pathNodes.length - 1; i++) {
        // node i is a collider if edge(i-1,i) points INTO i AND edge(i,i+1) points INTO i
        const incomingFromLeft = arrowIntoStep[i - 1]; // edge between node i-1 and i, arrow into i?
        const incomingFromRight = !arrowIntoStep[i]; // edge between i and i+1; arrowIntoStep[i] true means arrow into i+1, so arrow into i means false there
        colliders.push(incomingFromLeft && incomingFromRight);
      }
      results.push({
        nodes: [...pathNodes],
        colliders,
        // placeholder; corrected below via arrowDirectionBetween() once the full path is known
        startsWithArrowIntoFirst: false,
      });
      return;
    }
    for (const { other, arrowFromThisIntoOther } of adj.get(current) ?? []) {
      if (visited.has(other)) continue;
      visited.add(other);
      pathNodes.push(other);
      arrowIntoStep.push(arrowFromThisIntoOther);
      dfs(other);
      arrowIntoStep.pop();
      pathNodes.pop();
      visited.delete(other);
    }
  }

  dfs(from);

  // Fix startsWithArrowIntoFirst properly: it's whether the edge between
  // pathNodes[0] and pathNodes[1] has an arrowhead pointing INTO pathNodes[0]
  // (i.e. NOT arrowFromThisIntoOther, since that flag is "this -> other").
  return results.map((p) => {
    const firstStepArrowIntoSecond = arrowDirectionBetween(graph, p.nodes[0], p.nodes[1]);
    return { ...p, startsWithArrowIntoFirst: firstStepArrowIntoSecond === "into-second" ? false : true };
  });
}

function arrowDirectionBetween(graph: CausalGraph, a: string, b: string): "into-second" | "into-first" {
  const e = graph.edges.find((edge) => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
  if (!e) return "into-second";
  if (e.from === a && e.to === b) return "into-second"; // a -> b
  return "into-first"; // b -> a, arrow points into a (the first node)
}

/** A path is a backdoor path (relative to its first node as treatment) if it starts with an arrow INTO the treatment. */
export function isBackdoorPath(path: GraphPath): boolean {
  return path.startsWithArrowIntoFirst;
}

/** Is a given simple path blocked by conditioning set Z, under standard d-separation rules? */
export function isPathBlocked(graph: CausalGraph, path: GraphPath, z: Set<string>): boolean {
  for (let i = 1; i < path.nodes.length - 1; i++) {
    const node = path.nodes[i];
    const isCollider = path.colliders[i - 1];
    if (!isCollider) {
      if (z.has(node)) return true; // blocked by a conditioned-on non-collider
    } else {
      const descendants = descendantsOf(graph, node);
      const openedByConditioning = z.has(node) || [...descendants].some((d) => z.has(d));
      if (!openedByConditioning) return true; // collider blocks unless it/descendant is conditioned on
    }
  }
  return false;
}

export interface BackdoorCheckResult {
  valid: boolean;
  backdoorPaths: string[][];
  unblockedPaths: string[][];
  colliderViolations: { path: string[]; collider: string }[];
  descendantViolations: string[];
  reasons: string[];
}

/**
 * Explicit, testable backdoor-criterion check (Pearl's backdoor criterion):
 * an adjustment set Z is valid for estimating the effect of `treatment` on
 * `outcome` iff:
 *   (1) no member of Z is a descendant of `treatment`, and
 *   (2) Z blocks every backdoor path between `treatment` and `outcome`.
 * This function also explicitly flags the case where Z contains a collider
 * that OPENS a previously-blocked path ("refuse adjustment").
 */
export function checkBackdoorCriterion(
  graph: CausalGraph,
  treatment: string,
  outcome: string,
  adjustmentSet: string[],
): BackdoorCheckResult {
  const z = new Set(adjustmentSet);
  const reasons: string[] = [];
  const descendantViolations = adjustmentSet.filter((v) => descendantsOf(graph, treatment).has(v));
  if (descendantViolations.length > 0) {
    reasons.push(
      `Adjustment set includes descendant(s) of treatment: ${descendantViolations.join(", ")}. This can induce collider bias or block part of the causal effect.`,
    );
  }

  const allPaths = enumerateSimplePaths(graph, treatment, outcome);
  const backdoorPaths = allPaths.filter(isBackdoorPath);

  const unblockedPaths: string[][] = [];
  const colliderViolations: { path: string[]; collider: string }[] = [];

  for (const path of backdoorPaths) {
    const blocked = isPathBlocked(graph, path, z);
    if (!blocked) {
      unblockedPaths.push(path.nodes);
      // Diagnose whether the lack of blocking is because a collider on this path was (wrongly) conditioned on,
      // which would have blocked the path if left alone but was deliberately opened by Z.
      for (let i = 1; i < path.nodes.length - 1; i++) {
        const isCollider = path.colliders[i - 1];
        const node = path.nodes[i];
        if (isCollider && (z.has(node) || [...descendantsOf(graph, node)].some((d) => z.has(d)))) {
          colliderViolations.push({ path: path.nodes, collider: node });
        }
      }
    }
  }

  if (unblockedPaths.length > 0) {
    reasons.push(`${unblockedPaths.length} backdoor path(s) remain open: ${unblockedPaths.map((p) => p.join(" - ")).join(" | ")}`);
  }
  if (colliderViolations.length > 0) {
    reasons.push(
      `Adjustment set conditions on a collider, opening a spurious path: ${colliderViolations
        .map((c) => `${c.collider} on path ${c.path.join(" - ")}`)
        .join("; ")}. Refusing this adjustment set.`,
    );
  }

  const valid = descendantViolations.length === 0 && unblockedPaths.length === 0;

  return {
    valid,
    backdoorPaths: backdoorPaths.map((p) => p.nodes),
    unblockedPaths,
    colliderViolations,
    descendantViolations,
    reasons,
  };
}

/** Convenience: enumerate candidate minimal adjustment sets from the confounder-labeled parents of treatment & outcome. */
export function suggestAdjustmentSet(graph: CausalGraph, treatment: string, outcome: string): string[] {
  const candidates = graph.nodes
    .filter((n) => n.role === "confounder")
    .map((n) => n.id)
    .filter((id) => id !== treatment && id !== outcome);
  // Keep only candidates that are not descendants of treatment (would violate the criterion).
  const treatmentDescendants = descendantsOf(graph, treatment);
  return candidates.filter((c) => !treatmentDescendants.has(c));
}
