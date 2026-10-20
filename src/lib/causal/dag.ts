/**
 * DAG utilities over a StructuralCausalModel: acyclicity validation (loaded
 * at model-load time, per the standing order), path enumeration, and the
 * d-separation primitive that both the backdoor and frontdoor criteria rely
 * on.
 */

import type { CausalVariable, StructuralCausalModel } from "./types";

export class CyclicGraphError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Cyclic structural causal model: ${cycle.join(" -> ")}`);
    this.name = "CyclicGraphError";
  }
}

export interface Graph {
  nodes: string[];
  /** variable id -> direct parent ids (X <- parent) */
  parents: Map<string, string[]>;
  /** variable id -> direct child ids (X -> child) */
  children: Map<string, string[]>;
  variableById: Map<string, CausalVariable>;
}

export function buildGraph(scm: StructuralCausalModel): Graph {
  const nodes = scm.variables.map((v) => v.id);
  const nodeSet = new Set(nodes);
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    parents.set(n, []);
    children.set(n, []);
  }

  for (const a of scm.assignments) {
    if (!nodeSet.has(a.variable)) {
      throw new Error(
        `Structural assignment references unknown variable "${a.variable}"`
      );
    }
    for (const p of a.parents) {
      if (!nodeSet.has(p)) {
        throw new Error(
          `Structural assignment for "${a.variable}" references unknown parent "${p}"`
        );
      }
      parents.get(a.variable)!.push(p);
      children.get(p)!.push(a.variable);
    }
  }

  const variableById = new Map(scm.variables.map((v) => [v.id, v]));

  return { nodes, parents, children, variableById };
}

/**
 * Validates acyclicity via DFS colouring. Throws `CyclicGraphError` naming
 * the exact cycle (e.g. "retention -> oneOnOneFrequency -> retention") so a
 * model author can fix the DAG at load time rather than discovering it via
 * a silently wrong estimate downstream.
 */
export function assertAcyclic(graph: Graph): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>(graph.nodes.map((n) => [n, WHITE]));
  const stack: string[] = [];

  function visit(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    for (const child of graph.children.get(node) ?? []) {
      const c = color.get(child);
      if (c === GRAY) {
        const idx = stack.indexOf(child);
        const cycle = stack.slice(idx).concat(child);
        throw new CyclicGraphError(cycle);
      }
      if (c === WHITE) visit(child);
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.nodes) {
    if (color.get(node) === WHITE) visit(node);
  }
}

export function loadModel(scm: StructuralCausalModel): Graph {
  const graph = buildGraph(scm);
  assertAcyclic(graph);
  return graph;
}

export function topologicalOrder(graph: Graph): string[] {
  const inDegree = new Map<string, number>();
  for (const n of graph.nodes) inDegree.set(n, graph.parents.get(n)!.length);
  const queue = graph.nodes.filter((n) => inDegree.get(n) === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const c of graph.children.get(n) ?? []) {
      inDegree.set(c, inDegree.get(c)! - 1);
      if (inDegree.get(c) === 0) queue.push(c);
    }
  }
  if (order.length !== graph.nodes.length) {
    throw new Error("Graph has a cycle; cannot compute topological order.");
  }
  return order;
}

export function ancestors(graph: Graph, node: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(graph.parents.get(node) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(graph.parents.get(n) ?? []));
  }
  return seen;
}

export function descendants(graph: Graph, node: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(graph.children.get(node) ?? [])];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(graph.children.get(n) ?? []));
  }
  return seen;
}

interface PathEdge {
  node: string;
  /** direction of the edge *into* `node` from the previous node on the path */
  into: "forward" | "backward" | null; // forward: prev -> node, backward: node -> prev
}

/** Enumerate all simple (node-distinct) undirected paths between two nodes. */
function enumerateSimplePaths(
  graph: Graph,
  start: string,
  end: string
): PathEdge[][] {
  const results: PathEdge[][] = [];
  const visited = new Set<string>([start]);
  const current: PathEdge[] = [{ node: start, into: null }];

  function neighbours(node: string): { node: string; into: "forward" | "backward" }[] {
    const out: { node: string; into: "forward" | "backward" }[] = [];
    for (const c of graph.children.get(node) ?? []) out.push({ node: c, into: "forward" });
    for (const p of graph.parents.get(node) ?? []) out.push({ node: p, into: "backward" });
    return out;
  }

  function dfs(node: string): void {
    if (node === end) {
      results.push([...current]);
      return;
    }
    for (const { node: next, into } of neighbours(node)) {
      if (visited.has(next)) continue;
      visited.add(next);
      current.push({ node: next, into });
      dfs(next);
      current.pop();
      visited.delete(next);
    }
  }

  dfs(start);
  return results;
}

/**
 * A path is blocked by conditioning set Z if it contains a non-collider
 * (chain or fork) node that is in Z, OR a collider node that is NOT in Z
 * and has no descendant in Z.
 */
function isPathBlocked(graph: Graph, path: PathEdge[], z: Set<string>): boolean {
  for (let i = 1; i < path.length - 1; i++) {
    const prevEdge = path[i].into; // edge arriving at path[i] from path[i-1]
    const nextEdge = path[i + 1].into; // edge arriving at path[i+1] from path[i]
    const node = path[i].node;

    // Collider: prev -> node <- next  (i.e. prevEdge === 'forward' and the
    // edge leaving node towards next is also an arrow INTO node, meaning
    // nextEdge as seen from node->next is 'backward' i.e. next is a parent... )
    // We classify using arrow directions relative to `node`.
    const arrowIntoNodeFromPrev = prevEdge === "forward"; // prev -> node
    const arrowIntoNodeFromNext = nextEdge === "backward"; // next -> node (so node <- next not traversed yet)
    const isCollider = arrowIntoNodeFromPrev && arrowIntoNodeFromNext;

    if (isCollider) {
      const hasDescendantInZ =
        z.has(node) || [...descendants(graph, node)].some((d) => z.has(d));
      if (!hasDescendantInZ) return true; // collider not opened -> path blocked here
    } else {
      if (z.has(node)) return true; // chain or fork mediator conditioned on -> blocked
    }
  }
  return false;
}

/**
 * Backdoor paths from X to Y: paths that start with an arrow INTO X.
 */
export function backdoorPaths(graph: Graph, x: string, y: string): PathEdge[][] {
  const all = enumerateSimplePaths(graph, x, y);
  return all.filter((path) => path.length >= 2 && path[1].into === "backward");
}

export interface BackdoorResult {
  satisfied: boolean;
  adjustmentSet: string[];
  unblockedPaths: number;
  reason?: string;
}

/**
 * Finds a valid backdoor adjustment set: a set Z of OBSERVABLE,
 * non-descendant-of-X variables that blocks every backdoor path from X to Y.
 * Tries, in order: {} , parents(X) ∩ observable, then a widened search over
 * observable non-descendants. Fails loudly (satisfied=false) if no subset of
 * observable variables blocks all backdoor paths, naming why.
 */
export function backdoorAdjustmentSet(
  graph: Graph,
  x: string,
  y: string
): BackdoorResult {
  const paths = backdoorPaths(graph, x, y);
  if (paths.length === 0) {
    return { satisfied: true, adjustmentSet: [], unblockedPaths: 0 };
  }

  const xDescendants = descendants(graph, x);
  const candidates = graph.nodes.filter(
    (n) =>
      n !== x &&
      n !== y &&
      !xDescendants.has(n) &&
      graph.variableById.get(n)?.observable
  );

  // Try the canonical set first: parents(X) restricted to candidates.
  const parentSet = (graph.parents.get(x) ?? []).filter((p) => candidates.includes(p));
  const tryOrder: string[][] = [parentSet];

  // Then try growing subsets (candidates are few in practice domain/synthetic
  // models, so a bounded power-set search is acceptable).
  const maxSubsetSize = Math.min(candidates.length, 6);
  for (let size = 0; size <= maxSubsetSize; size++) {
    tryOrder.push(...subsetsOfSize(candidates, size));
  }

  for (const z of tryOrder) {
    const zSet = new Set(z);
    const allBlocked = paths.every((p) => isPathBlocked(graph, p, zSet));
    if (allBlocked) {
      return { satisfied: true, adjustmentSet: [...zSet].sort(), unblockedPaths: 0 };
    }
  }

  // Nothing observable blocks every path: identify which paths resist and
  // name the latent variables implicated so the caller can report suspected
  // confounders.
  const stillUnblockedWithAllObservable = paths.filter(
    (p) => !isPathBlocked(graph, p, new Set(candidates))
  ).length;

  return {
    satisfied: false,
    adjustmentSet: [],
    unblockedPaths: stillUnblockedWithAllObservable || paths.length,
    reason:
      "No subset of observed variables blocks every backdoor path; at least one backdoor path runs through an unobservable (latent) variable.",
  };
}

function subsetsOfSize(arr: string[], size: number): string[][] {
  const results: string[][] = [];
  function helper(start: number, current: string[]): void {
    if (current.length === size) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return results;
}

export interface FrontdoorResult {
  satisfied: boolean;
  mediators: string[];
  reason?: string;
}

/**
 * Frontdoor criterion for mediator set M between X and Y:
 *  1. M intercepts all directed paths from X to Y.
 *  2. There is no unblocked backdoor path from X to M.
 *  3. Every backdoor path from M to Y is blocked by X.
 */
export function frontdoorAdjustment(
  graph: Graph,
  x: string,
  y: string
): FrontdoorResult {
  const directChildren = graph.children.get(x) ?? [];
  // Candidate mediators: observable children of X that are ancestors of Y.
  const yAncestors = ancestors(graph, y);
  const candidates = directChildren.filter(
    (c) => graph.variableById.get(c)?.observable && (yAncestors.has(c) || c === y)
  );

  for (let size = 1; size <= candidates.length; size++) {
    for (const mSet of subsetsOfSize(candidates, size)) {
      if (!interceptsAllDirectedPaths(graph, x, y, mSet)) continue;
      const mSetArr = mSet;
      const backdoorXtoM = mSetArr.every(
        (m) => backdoorAdjustmentSet(graph, x, m).satisfied
      );
      if (!backdoorXtoM) continue;
      const backdoorMtoY = mSetArr.every((m) => {
        const bp = backdoorPaths(graph, m, y);
        return bp.every((p) => isPathBlocked(graph, p, new Set([x])));
      });
      if (!backdoorMtoY) continue;
      return { satisfied: true, mediators: mSetArr.sort() };
    }
  }

  return {
    satisfied: false,
    mediators: [],
    reason: "No mediator set satisfies the frontdoor criterion.",
  };
}

function interceptsAllDirectedPaths(
  graph: Graph,
  x: string,
  y: string,
  mSet: string[]
): boolean {
  const mSetSet = new Set(mSet);
  // DFS over directed edges only, from x to y, failing if any path avoids M.
  const visiting = new Set<string>();
  function dfs(node: string, hitMediator: boolean): boolean {
    if (node === y) return hitMediator;
    if (visiting.has(node)) return true; // cycle guard (shouldn't happen in a DAG)
    visiting.add(node);
    let ok = true;
    for (const child of graph.children.get(node) ?? []) {
      const nextHit = hitMediator || mSetSet.has(child);
      if (child === y && !nextHit) {
        ok = false;
        break;
      }
      if (!dfs(child, nextHit)) {
        ok = false;
        break;
      }
    }
    visiting.delete(node);
    return ok;
  }
  return dfs(x, mSetSet.has(x));
}
