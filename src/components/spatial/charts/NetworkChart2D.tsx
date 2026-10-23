import { useMemo } from "react";
import type { SceneEdge, SceneNode } from "@/types/spatial";

/** 2D semantic-equivalent chart for the ecosystem scene: the same force
 * layout, flattened (x,z plane) with no perspective — a legitimate 2D
 * network diagram per Part 02's grammar (color = category, size = magnitude). */
export function NetworkChart2D({
  nodes,
  edges,
  colorFor,
  selectedId,
  onSelect,
}: {
  nodes: SceneNode[];
  edges: SceneEdge[];
  colorFor: (n: SceneNode) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.position.x);
    const zs = nodes.map((n) => n.position.z);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
  }, [nodes]);

  const size = 480;
  const pad = 24;
  const sx = (x: number) => pad + ((x - bounds.minX) / Math.max(1e-6, bounds.maxX - bounds.minX)) * (size - pad * 2);
  const sy = (z: number) => pad + ((z - bounds.minZ) / Math.max(1e-6, bounds.maxZ - bounds.minZ)) * (size - pad * 2);

  const idToNode = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="img" aria-label="2D network diagram, equivalent to the 3D ecosystem scene">
      <rect x={0} y={0} width={size} height={size} fill="#f8fafc" rx={12} />
      {edges.map((e) => {
        const a = idToNode.get(e.source);
        const b = idToNode.get(e.target);
        if (!a || !b) return null;
        return (
          <line
            key={e.id}
            x1={sx(a.position.x)}
            y1={sy(a.position.z)}
            x2={sx(b.position.x)}
            y2={sy(b.position.z)}
            stroke={e.kind === "critical-path" ? "#f59e0b" : "#cbd5e1"}
            strokeWidth={e.kind === "critical-path" ? 1.5 : 1}
          />
        );
      })}
      {nodes.map((n) => (
        <circle
          key={n.id}
          cx={sx(n.position.x)}
          cy={sy(n.position.z)}
          r={Math.max(3, Math.sqrt(n.magnitude) * 1.1)}
          fill={colorFor(n)}
          stroke={n.id === selectedId ? "#1d4ed8" : "transparent"}
          strokeWidth={2}
          tabIndex={0}
          role="button"
          aria-label={`${n.label}: ${n.magnitude} dependencies, category ${n.category}`}
          onClick={() => onSelect(n.id)}
          onFocus={() => onSelect(n.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(n.id);
          }}
          className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        />
      ))}
    </svg>
  );
}
