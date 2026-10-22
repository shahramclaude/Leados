"use client";

import { useEffect, useMemo, useRef } from "react";

export interface NetworkGraphData {
  nodes: { id: string; name: string; team: string; riskScore: number }[];
  edges: { source: string; target: string; weight: number }[];
  truncated: boolean;
  totalEdges: number;
}

/**
 * Canvas-rendered org network (not SVG/DOM-per-node) so a few hundred nodes
 * never create a few hundred React-reconciled DOM elements. Layout is a
 * single deterministic circular placement computed once via `useMemo` keyed
 * by the node id list, so panning/re-renders of the parent dashboard never
 * re-run layout math. The server already bounds the edge count (see
 * src/db/repositories/network.ts) — this component just renders what it is
 * given and surfaces the truncation notice.
 */
export function Network({ data }: { data: NetworkGraphData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const layout = useMemo(() => {
    const n = data.nodes.length;
    const radius = 160;
    const cx = 200;
    const cy = 200;
    const positions = new Map<string, { x: number; y: number }>();
    data.nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(n, 1);
      positions.set(node.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.nodes.map((n) => n.id).join(",")]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(100,116,139,0.25)";
    data.edges.forEach((edge) => {
      const a = layout.get(edge.source);
      const b = layout.get(edge.target);
      if (!a || !b) return;
      ctx.lineWidth = Math.max(0.5, Math.min(3, edge.weight));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    data.nodes.forEach((node) => {
      const p = layout.get(node.id);
      if (!p) return;
      const risk = Math.max(0, Math.min(1, node.riskScore));
      ctx.fillStyle = `rgb(${Math.round(220 * risk + 30)}, ${Math.round(120 * (1 - risk) + 40)}, 90)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [data, layout]);

  return (
    <div>
      <canvas ref={canvasRef} width={400} height={400} className="mx-auto block" />
      <p className="mt-1 text-center text-xs text-slate-500">
        {data.nodes.length} people, {data.edges.length} relationships shown
        {data.truncated ? ` — truncated: showing top ${data.edges.length} of ${data.totalEdges} relationships by weight` : ""}
      </p>
    </div>
  );
}
