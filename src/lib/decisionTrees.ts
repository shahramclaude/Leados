// D. Decision Trees — the interactive tool: probability branches, EV roll-ups,
// sensitivity. Pure tree math operating on `decision_tree_nodes` rows.
import { db } from "@/db";
import { decisionTreeNodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { num, round2 } from "@/lib/format";

export type TreeNodeRow = {
  id: number;
  decisionId: number;
  parentId: number | null;
  nodeType: "decision" | "chance" | "outcome";
  label: string;
  probability: number | null;
  payoff: number | null;
};

export type TreeNodeComputed = TreeNodeRow & { ev: number; children: TreeNodeComputed[]; recommended: boolean };

export function rollUpTree(nodes: TreeNodeRow[]): TreeNodeComputed[] {
  const byParent = new Map<number | null, TreeNodeRow[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  }

  function build(node: TreeNodeRow): TreeNodeComputed {
    const children = (byParent.get(node.id) ?? []).map(build);
    let ev: number;
    let recommendedChildId: number | null = null;

    if (node.nodeType === "outcome") {
      ev = node.payoff ?? 0;
    } else if (node.nodeType === "chance") {
      ev = children.reduce((sum, c) => sum + (c.probability ?? 0) * c.ev, 0);
    } else {
      // decision node: pick the max-EV child (the recommended branch)
      let best = -Infinity;
      for (const c of children) {
        if (c.ev > best) {
          best = c.ev;
          recommendedChildId = c.id;
        }
      }
      ev = children.length ? best : node.payoff ?? 0;
    }

    return { ...node, ev: round2(ev), children: children.map((c) => ({ ...c, recommended: c.id === recommendedChildId })), recommended: false };
  }

  const roots = byParent.get(null) ?? [];
  return roots.map(build);
}

export async function getTree(decisionId: number) {
  const rows = await db.select().from(decisionTreeNodes).where(eq(decisionTreeNodes.decisionId, decisionId));
  const nodes: TreeNodeRow[] = rows.map((r) => ({
    id: r.id,
    decisionId: r.decisionId,
    parentId: r.parentId,
    nodeType: r.nodeType as TreeNodeRow["nodeType"],
    label: r.label,
    probability: r.probability != null ? num(r.probability) : null,
    payoff: r.payoff != null ? num(r.payoff) : null,
  }));
  return rollUpTree(nodes);
}

/** Sensitivity: how much does the root EV move if a chance node's probability shifts ±10pp? */
export function probabilitySensitivity(nodes: TreeNodeRow[]): { nodeId: number; label: string; baseRootEv: number; shiftedRootEv: number; swing: number }[] {
  const baseTree = rollUpTree(nodes)[0];
  if (!baseTree) return [];
  const baseRootEv = baseTree.ev;

  const chanceNodes = nodes.filter((n) => n.nodeType === "chance" && n.probability != null);
  return chanceNodes
    .map((cn) => {
      const shifted = nodes.map((n) => (n.id === cn.id ? { ...n, probability: Math.min(1, (n.probability ?? 0) + 0.1) } : n));
      const shiftedTree = rollUpTree(shifted)[0];
      return {
        nodeId: cn.id,
        label: cn.label,
        baseRootEv,
        shiftedRootEv: shiftedTree?.ev ?? baseRootEv,
        swing: round2((shiftedTree?.ev ?? baseRootEv) - baseRootEv),
      };
    })
    .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing));
}
