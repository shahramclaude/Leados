import { useState } from "react";
import { Card, SectionHeader, Badge } from "../components/ui";
import { orgTree } from "../data/mockData";
import type { OrgNode } from "../types";

function TreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  return (
    <div style={{ marginLeft: depth * 20 }} className="mb-2">
      <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
        <span className="font-medium text-slate-800">{node.name}</span>
        <span className="text-xs text-slate-400">· {node.role}</span>
      </div>
      {node.children?.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

function flatten(node: OrgNode, depth = 0): { node: OrgNode; depth: number }[] {
  return [{ node, depth }, ...(node.children?.flatMap((c) => flatten(c, depth + 1)) ?? [])];
}

export function SpatialView() {
  const [mode, setMode] = useState<"spatial" | "semantic">("spatial");
  const flat = flatten(orgTree);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Org / Spatial View"
        subtitle="Same underlying data, two renderings — spatial (tree) and semantic (list) always stay in parity."
        action={
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
            <button onClick={() => setMode("spatial")} className={`rounded-md px-3 py-1.5 ${mode === "spatial" ? "bg-white shadow-sm font-medium" : "text-slate-500"}`}>Spatial</button>
            <button onClick={() => setMode("semantic")} className={`rounded-md px-3 py-1.5 ${mode === "semantic" ? "bg-white shadow-sm font-medium" : "text-slate-500"}`}>Semantic (list)</button>
          </div>
        }
      />
      <Card>
        {mode === "spatial" ? (
          <TreeNode node={orgTree} />
        ) : (
          <ul className="space-y-1">
            {flat.map(({ node, depth }) => (
              <li key={node.id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">{"— ".repeat(depth)}</span>
                <span className="font-medium text-slate-800">{node.name}</span>
                <span className="text-xs text-slate-400">{node.role}</span>
                {depth === 0 && <Badge tone="indigo">root</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-slate-500">Both views read from the same `orgTree` object in src/data/mockData.ts — no divergent data path exists.</p>
    </div>
  );
}
