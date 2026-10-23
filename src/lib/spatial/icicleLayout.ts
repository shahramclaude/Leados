/**
 * 2D icicle partition layout for the org-structure scene.
 * Phase 0 verdict: for strict trees, a 2D icicle reads hierarchy depth via
 * position (y) and sibling share via length (x-width) — both top-rank
 * Cleveland–McGill channels. No 3D study shows an icicle/sunburst improving
 * on this for trees of this size, so 2D is PRIMARY here (see docs §Phase 0).
 */
import type { OrgNode } from "@/data/orgHierarchy";
import { sumHeadcount } from "@/data/orgHierarchy";

export interface IcicleRect {
  id: string;
  name: string;
  depth: number;
  x: number;
  width: number;
  headcount: number;
  path: string[];
}

export function layoutIcicle(root: OrgNode, totalWidth = 1000): IcicleRect[] {
  const rects: IcicleRect[] = [];

  function place(node: OrgNode, depth: number, x0: number, x1: number, path: string[]) {
    const headcount = sumHeadcount(node);
    rects.push({ id: node.id, name: node.name, depth, x: x0, width: x1 - x0, headcount, path: [...path, node.name] });
    if (!node.children || node.children.length === 0) return;
    let cursor = x0;
    for (const child of node.children) {
      const share = sumHeadcount(child) / Math.max(1, headcount);
      const childWidth = (x1 - x0) * share;
      place(child, depth + 1, cursor, cursor + childWidth, [...path, node.name]);
      cursor += childWidth;
    }
  }

  place(root, 0, 0, totalWidth, []);
  return rects;
}
