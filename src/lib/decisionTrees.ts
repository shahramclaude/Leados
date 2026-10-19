// decisionTrees — expected-value roll-back ("folding back") engine for the
// interactive Decision Trees tool. A tree is built from decision nodes
// (we choose a branch, optionally paying a cost), chance nodes (the world
// chooses a branch according to a probability we estimate), and outcome
// leaves (a terminal payoff). Folding back from the leaves gives both the
// expected value of the whole tree and which first branch to take.

export type TreeNodeType = "decision" | "chance" | "outcome";

export interface TreeNode {
  id: string;
  type: TreeNodeType;
  label: string;
  /** Cost of choosing this branch — only meaningful on a decision node's children. */
  cost?: number;
  /** Probability this branch occurs — only meaningful on a chance node's children; siblings should sum to ~1. */
  probability?: number;
  /** Terminal payoff — only meaningful on outcome (leaf) nodes. */
  value?: number;
  children?: TreeNode[];
}

export interface FoldedNode {
  id: string;
  label: string;
  type: TreeNodeType;
  expectedValue: number;
  bestChildId: string | null; // for decision nodes: the recommended branch
  children: FoldedNode[];
}

export interface TreeValidationWarning {
  nodeId: string;
  message: string;
}

export function validateTree(root: TreeNode): TreeValidationWarning[] {
  const warnings: TreeValidationWarning[] = [];
  function walk(node: TreeNode) {
    if (node.type === "chance" && node.children?.length) {
      const sum = node.children.reduce((s, c) => s + (c.probability ?? 0), 0);
      if (Math.abs(sum - 1) > 0.02) {
        warnings.push({ nodeId: node.id, message: `Chance node "${node.label}" branch probabilities sum to ${sum.toFixed(2)}, not 1.00.` });
      }
    }
    if (node.type !== "outcome" && (!node.children || node.children.length === 0)) {
      warnings.push({ nodeId: node.id, message: `"${node.label}" is a ${node.type} node with no children (and isn't an outcome leaf).` });
    }
    node.children?.forEach(walk);
  }
  walk(root);
  return warnings;
}

/**
 * Folds the tree back from the leaves: outcome nodes return their value,
 * chance nodes return the probability-weighted sum of their children, and
 * decision nodes return the value of their *best* child net of that
 * branch's cost (and remember which branch that was).
 */
export function foldBack(root: TreeNode): FoldedNode {
  function fold(node: TreeNode): FoldedNode {
    if (node.type === "outcome" || !node.children || node.children.length === 0) {
      return { id: node.id, label: node.label, type: node.type, expectedValue: node.value ?? 0, bestChildId: null, children: [] };
    }

    const foldedChildren = node.children.map(fold);

    if (node.type === "chance") {
      const totalProbability = node.children.reduce((s, c) => s + (c.probability ?? 0), 0) || 1;
      const expectedValue = node.children.reduce((sum, c, i) => sum + ((c.probability ?? 0) / totalProbability) * foldedChildren[i].expectedValue, 0);
      return { id: node.id, label: node.label, type: node.type, expectedValue, bestChildId: null, children: foldedChildren };
    }

    // decision node: pick the branch with the highest (child EV - cost)
    let bestIdx = 0;
    let bestNet = -Infinity;
    node.children.forEach((c, i) => {
      const net = foldedChildren[i].expectedValue - (c.cost ?? 0);
      if (net > bestNet) {
        bestNet = net;
        bestIdx = i;
      }
    });
    return { id: node.id, label: node.label, type: node.type, expectedValue: bestNet, bestChildId: node.children[bestIdx]?.id ?? null, children: foldedChildren };
  }
  return fold(root);
}

export interface RecommendedPathStep {
  nodeId: string;
  label: string;
  type: TreeNodeType;
}

/** Walks the folded tree following `bestChildId` at every decision node to produce the recommended path. */
export function recommendedPath(root: TreeNode, folded: FoldedNode): RecommendedPathStep[] {
  const path: RecommendedPathStep[] = [];
  let rawNode: TreeNode | undefined = root;
  let foldedNode: FoldedNode | undefined = folded;
  while (rawNode && foldedNode) {
    const currentRaw: TreeNode = rawNode;
    const currentFolded: FoldedNode = foldedNode;
    path.push({ nodeId: currentRaw.id, label: currentRaw.label, type: currentRaw.type });
    if (currentFolded.type === "decision" && currentFolded.bestChildId) {
      const bestChildId: string = currentFolded.bestChildId;
      const idx: number = currentRaw.children?.findIndex((c) => c.id === bestChildId) ?? -1;
      rawNode = idx >= 0 ? currentRaw.children?.[idx] : undefined;
      foldedNode = idx >= 0 ? currentFolded.children[idx] : undefined;
    } else if (currentFolded.children.length === 1) {
      rawNode = currentRaw.children?.[0];
      foldedNode = currentFolded.children[0];
    } else {
      break; // chance node with >1 branch: no single "recommended" path beyond this point
    }
  }
  return path;
}

/**
 * Sensitivity bound: an optimistic tree (every chance node resolves to its
 * best-case child) and a pessimistic tree (every chance node resolves to its
 * worst-case child), giving a quick range around the expected value without
 * a full Monte Carlo pass.
 */
export function sensitivityRange(root: TreeNode): { optimistic: number; expected: number; pessimistic: number } {
  function extreme(node: TreeNode, pick: "max" | "min"): number {
    if (node.type === "outcome" || !node.children || node.children.length === 0) return node.value ?? 0;
    const childValues = node.children.map((c) => extreme(c, pick) - (node.type === "decision" ? c.cost ?? 0 : 0));
    if (node.type === "decision") return pick === "max" ? Math.max(...childValues) : Math.max(...childValues); // decision always "picks best available" even in pessimistic framing
    return pick === "max" ? Math.max(...childValues) : Math.min(...childValues);
  }
  const expected = foldBack(root).expectedValue;
  return { optimistic: extreme(root, "max"), expected, pessimistic: extreme(root, "min") };
}

/** A small starter template so the interactive tool never opens empty. */
export function buildExampleTree(): TreeNode {
  return {
    id: "root",
    type: "decision",
    label: "Enter new market segment?",
    children: [
      {
        id: "enter",
        type: "chance",
        label: "Enter now",
        cost: 150000,
        children: [
          { id: "enter-success", type: "outcome", label: "Segment adopts quickly", probability: 0.4, value: 900000 },
          { id: "enter-partial", type: "outcome", label: "Partial adoption", probability: 0.4, value: 300000 },
          { id: "enter-fail", type: "outcome", label: "Segment rejects offering", probability: 0.2, value: -100000 },
        ],
      },
      {
        id: "wait",
        type: "chance",
        label: "Wait 2 quarters, gather more data",
        cost: 20000,
        children: [
          { id: "wait-good-news", type: "outcome", label: "Market signal strengthens, then enter", probability: 0.5, value: 500000 },
          { id: "wait-bad-news", type: "outcome", label: "Market signal weakens, we skip it", probability: 0.5, value: 0 },
        ],
      },
      {
        id: "skip",
        type: "outcome",
        label: "Don't pursue this segment",
        cost: 0,
        value: 0,
      },
    ],
  };
}
