// src/lib/intelligence/bayesianNetwork.ts
//
// A small, exact discrete Bayesian network used when a belief depends on the
// joint state of several upstream beliefs (e.g. "renewal likelihood" depends
// jointly on "usage trend" and "support sentiment"), rather than a single
// stream of evidence (which beliefFabric.ts handles directly).
//
// Inference is exact enumeration over the joint distribution of boolean
// nodes. This is intentionally simple (no variable elimination / sampling)
// because LEADOS networks are small (<= ~12 nodes); exactness keeps results
// reproducible and testable, which the standing order requires. If/when
// networks grow, swap the `enumerate` core for variable elimination without
// touching the public API.
export interface BooleanNode {
  id: string;
  label: string;
  /** parents by id; [] for root nodes */
  parents: string[];
  /** conditional probability table: key = parents' boolean states joined by
   * "," in parent order (e.g. "true,false"), value = P(node=true | parents).
   * Root nodes use the single key "". */
  cpt: Record<string, number>;
}

export class BayesianNetwork {
  private nodes = new Map<string, BooleanNode>();
  private order: string[] = [];

  addNode(node: BooleanNode): void {
    for (const parentId of node.parents) {
      if (!this.nodes.has(parentId)) {
        throw new Error(`Parent node "${parentId}" must be added before child "${node.id}"`);
      }
    }
    this.nodes.set(node.id, node);
    this.order.push(node.id);
  }

  getNode(id: string): BooleanNode | undefined {
    return this.nodes.get(id);
  }

  private cptKey(node: BooleanNode, assignment: Record<string, boolean>): string {
    return node.parents.map((p) => String(assignment[p])).join(",");
  }

  private jointProbability(assignment: Record<string, boolean>): number {
    let p = 1;
    for (const id of this.order) {
      const node = this.nodes.get(id)!;
      const key = this.cptKey(node, assignment);
      const pTrue = node.cpt[key];
      if (pTrue === undefined) {
        throw new Error(`Missing CPT entry for node "${id}" with parents=${key || "(root)"}`);
      }
      p *= assignment[id] ? pTrue : 1 - pTrue;
    }
    return p;
  }

  /** Exact marginal/conditional query: P(queryId = true | evidence). Uses
   * full enumeration of the joint distribution, which is exact for discrete
   * Bayesian networks (Russell & Norvig, "Artificial Intelligence: A Modern
   * Approach", §13.3, enumeration-ask). */
  query(queryId: string, evidence: Record<string, boolean> = {}): number {
    const ids = this.order;
    if (!this.nodes.has(queryId)) throw new Error(`Unknown node "${queryId}"`);

    let numerator = 0;
    let denominator = 0;
    const n = ids.length;
    const total = 1 << n;
    for (let mask = 0; mask < total; mask++) {
      const assignment: Record<string, boolean> = {};
      for (let i = 0; i < n; i++) assignment[ids[i]] = ((mask >> i) & 1) === 1;

      let consistent = true;
      for (const [k, v] of Object.entries(evidence)) {
        if (assignment[k] !== v) {
          consistent = false;
          break;
        }
      }
      if (!consistent) continue;

      const p = this.jointProbability(assignment);
      denominator += p;
      if (assignment[queryId]) numerator += p;
    }
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  /** Sensitivity of the query node to each other node, measured as the
   * absolute change in P(query) when that node is clamped true vs false
   * (holding all else unobserved). Used as `drivers[]` contributions for
   * network-derived explanations. */
  sensitivities(queryId: string, evidence: Record<string, boolean> = {}): { id: string; contribution: number }[] {
    const base = this.query(queryId, evidence);
    const results: { id: string; contribution: number }[] = [];
    for (const id of this.order) {
      if (id === queryId || evidence[id] !== undefined) continue;
      const whenTrue = this.query(queryId, { ...evidence, [id]: true });
      const whenFalse = this.query(queryId, { ...evidence, [id]: false });
      results.push({ id, contribution: whenTrue - whenFalse });
    }
    return results.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  }
}

/** Builds the default "renewal likelihood" network used by
 * predictiveScoring.ts as a worked example network. */
export function buildRenewalNetwork(): BayesianNetwork {
  const net = new BayesianNetwork();
  net.addNode({ id: "usageUp", label: "Product usage trending up", parents: [], cpt: { "": 0.5 } });
  net.addNode({ id: "supportHealthy", label: "Support sentiment healthy", parents: [], cpt: { "": 0.6 } });
  net.addNode({
    id: "championActive",
    label: "Executive champion engaged",
    parents: ["supportHealthy"],
    cpt: { true: 0.7, false: 0.35 },
  });
  net.addNode({
    id: "renews",
    label: "Account renews",
    parents: ["usageUp", "championActive"],
    cpt: {
      "true,true": 0.92,
      "true,false": 0.63,
      "false,true": 0.55,
      "false,false": 0.18,
    },
  });
  return net;
}
