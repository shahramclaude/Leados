"use client";

import { useEffect, useRef, useState } from "react";
import { getComputeWorkerPool } from "@/workers/computeWorkerPool";

export type NetworkNode = { id: string; name: string; kind: string; riskScore: number };
export type NetworkEdge = { source: string; target: string; kind: string; weight: number };

type Position = { id: string; x: number; y: number };

const WIDTH = 560;
const HEIGHT = 320;
const KIND_COLOR: Record<string, string> = {
  account: "#2563eb",
  rep: "#059669",
  deal: "#d97706",
};

/**
 * Force-directed network graph. Layout is computed in a web worker
 * (computeWorkerPool -> monteCarloWorker's `networkLayout` task) so the main
 * thread never blocks even for a few hundred nodes/edges doing repeated
 * O(n^2) repulsion passes.
 */
export function NetworkGraph({ nodes, edges }: { nodes: NetworkNode[]; edges: NetworkEdge[] }) {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (nodes.length === 0) return;
    let cancelled = false;
    const pool = getComputeWorkerPool();
    const { promise, cancel } = pool.runNetworkLayout(
      {
        nodeIds: nodes.map((n) => n.id),
        edges: edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
        iterations: 160,
        width: WIDTH,
        height: HEIGHT,
      },
      (p) => {
        if (!cancelled) setProgress(p);
      },
    );
    cancelRef.current = cancel;

    promise
      .then((result) => {
        if (!cancelled) setPositions(result.positions);
      })
      .catch(() => {
        /* cancelled or worker error: panel falls back to the loading state */
      });

    return () => {
      cancelled = true;
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length]);

  const byId = new Map(positions?.map((p) => [p.id, p]) ?? []);

  return (
    <div>
      {!positions && (
        <div className="mb-2 h-1 w-full overflow-hidden rounded bg-slate-100">
          <div
            className="h-full bg-blue-500 transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-label="Entity network graph">
        <title>Entity network graph</title>
        {positions &&
          edges.map((edge, i) => {
            const a = byId.get(edge.source);
            const b = byId.get(edge.target);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#cbd5e1"
                strokeWidth={Math.min(3, 0.5 + edge.weight / 4)}
              />
            );
          })}
        {positions &&
          nodes.map((node) => {
            const pos = byId.get(node.id);
            if (!pos) return null;
            return (
              <g key={node.id}>
                <circle cx={pos.x} cy={pos.y} r={4 + node.riskScore} fill={KIND_COLOR[node.kind] ?? "#64748b"} />
              </g>
            );
          })}
      </svg>
      {positions && (
        <div className="mt-2 flex gap-4 text-xs text-slate-500">
          {Object.entries(KIND_COLOR).map(([kind, color]) => (
            <span key={kind} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {kind}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default NetworkGraph;
