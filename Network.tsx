import { useMemo, useState } from "react";
import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { NetworkEdge, NetworkNode, VizMeta } from "./types";

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Simplified spring-model force layout, 20 iterations max.
 * Deliberately approximate — per the brief, "Layout is approximate.
 * Positions carry no meaning." */
function layout(nodes: NetworkNode[], edges: NetworkEdge[], width: number, height: number) {
  const pos = new Map<string, Pos>();
  nodes.forEach((n, i) => {
    const angle = (Math.PI * 2 * i) / nodes.length;
    pos.set(n.id, {
      x: width / 2 + Math.cos(angle) * (width / 3),
      y: height / 2 + Math.sin(angle) * (height / 3),
      vx: 0,
      vy: 0,
    });
  });

  for (let iter = 0; iter < 20; iter++) {
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!;
        const b = pos.get(nodes[j].id)!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy || 0.01;
        const force = 1800 / dist2;
        const dist = Math.sqrt(dist2) || 0.01;
        dx /= dist;
        dy /= dist;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }
    }
    // spring attraction along edges
    edges.forEach((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const targetDist = 90;
      const force = (dist - targetDist) * 0.02;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    });
    // integrate + center pull + damping
    pos.forEach((p) => {
      p.vx += (width / 2 - p.x) * 0.002;
      p.vy += (height / 2 - p.y) * 0.002;
      p.vx *= 0.8;
      p.vy *= 0.8;
      p.x += p.vx;
      p.y += p.vy;
      p.x = Math.max(24, Math.min(width - 24, p.x));
      p.y = Math.max(24, Math.min(height - 24, p.y));
    });
  }
  return pos;
}

const edgeStyle: Record<NetworkEdge["type"], { dash?: string }> = {
  collaboration: {},
  information: { dash: "5 3" },
  decision: { dash: "1 3" },
  blocker: { dash: "2 2" },
};

export function Network({
  nodes,
  edges,
  meta,
  onSelect,
}: {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  meta: VizMeta;
  onSelect?: (id: string) => void;
}) {
  const width = 480;
  const height = 320;
  const pos = useMemo(() => layout(nodes, edges, width, height), [nodes, edges]);
  const [hover, setHover] = useState<string | null>(null);

  const table = (
    <table>
      <caption>Org network (nodes)</caption>
      <thead>
        <tr>
          <th>name</th>
          <th>type</th>
          <th>domain</th>
          <th>in</th>
          <th>out</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((n) => (
          <tr key={n.id}>
            <td>{n.label}</td>
            <td>{n.type}</td>
            <td>{n.domain}</td>
            <td>{n.indegree}</td>
            <td>{n.outdegree}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height}>
      {({ titleId, descId }) => (
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} width="100%" viewBox={`0 0 ${width} ${height}`}>
          {vizTitleDesc(
            "Org network graph",
            `${nodes.length} people, ${edges.length} logged relationships. Layout is approximate; positions carry no meaning.`,
            { titleId, descId }
          )}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--ink-3)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--ink-4)"
                strokeWidth={Math.max(1, e.strength)}
                strokeDasharray={edgeStyle[e.type].dash}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const r = 6 + (n.indegree + n.outdegree);
            const color = `var(--domain-${n.domain})`;
            const isHover = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => onSelect?.(n.id)}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                {n.type === "bridge" ? (
                  <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={color} opacity={0.85} />
                ) : n.type === "isolate" ? (
                  <circle r={r} fill="none" stroke={color} strokeDasharray="3 2" strokeWidth={1.5} />
                ) : (
                  <circle r={r} fill={color} opacity={0.85} />
                )}
                <text y={r + 11} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-2)">
                  {n.label}
                </text>
                {isHover && (
                  <foreignObject x={r + 4} y={-30} width={140} height={60}>
                    <div
                      style={{
                        background: "var(--ink-1)",
                        color: "white",
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        borderRadius: 4,
                        padding: "4px 6px",
                      }}
                    >
                      {n.label} · {n.type}
                      <br />
                      {n.domain} · in {n.indegree} / out {n.outdegree}
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </ChartFrame>
  );
}
