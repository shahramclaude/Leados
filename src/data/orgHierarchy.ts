/**
 * Large org-structure hierarchy, used to test the 2D-preferred icicle/sunburst
 * treatment (Phase 0 verdict: 3D does not outperform a good 2D icicle for
 * strict trees — see docs/part49-spatial-analytics.md §Phase 5).
 */
export interface OrgNode {
  id: string;
  name: string;
  headcount: number;
  children?: OrgNode[];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic synthetic org tree, ~500 leaf contributors across 4 levels. */
export function buildOrgHierarchy(): OrgNode {
  const rand = mulberry32(99);
  const divisions = ["Platform", "Growth", "Operations", "Research"];
  const root: OrgNode = { id: "root", name: "LEADOS", headcount: 0, children: [] };

  for (const div of divisions) {
    const divNode: OrgNode = { id: `div-${div}`, name: div, headcount: 0, children: [] };
    const deptCount = 3 + Math.floor(rand() * 3);
    for (let d = 0; d < deptCount; d++) {
      const deptNode: OrgNode = { id: `${div}-dept-${d}`, name: `${div} Dept ${d + 1}`, headcount: 0, children: [] };
      const teamCount = 2 + Math.floor(rand() * 4);
      for (let t = 0; t < teamCount; t++) {
        const size = 3 + Math.floor(rand() * 12);
        deptNode.children!.push({ id: `${div}-${d}-team-${t}`, name: `Team ${t + 1}`, headcount: size });
      }
      divNode.children!.push(deptNode);
    }
    root.children!.push(divNode);
  }
  return root;
}

export function sumHeadcount(node: OrgNode): number {
  if (!node.children || node.children.length === 0) return node.headcount;
  const total = node.children.reduce((acc, c) => acc + sumHeadcount(c), 0);
  return total;
}

export function flattenOrg(node: OrgNode, depth = 0, path: string[] = []): { node: OrgNode; depth: number; headcount: number; path: string[] }[] {
  const headcount = sumHeadcount(node);
  const here = [{ node, depth, headcount, path: [...path, node.name] }];
  if (!node.children) return here;
  return here.concat(node.children.flatMap((c) => flattenOrg(c, depth + 1, [...path, node.name])));
}
