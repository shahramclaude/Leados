import { useMemo, useState } from 'react';
import type { OrgNetworkGraph } from '../../lib/orgNetworkIntelligence';
import { initials } from './shared';

interface Props {
  graph: OrgNetworkGraph;
  onSelect: (id: string) => void;
}

const WIDTH = 760;
const HEIGHT = 520;
const CLUSTER_PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#c084fc', '#f87171'];

export function Network({ graph, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    const clusterCount = Math.max(1, graph.clusters.length);
    const clusterRadius = Math.min(WIDTH, HEIGHT) * 0.32;
    const center = { x: WIDTH / 2, y: HEIGHT / 2 };

    graph.clusters.forEach((cluster, ci) => {
      const angle = (2 * Math.PI * ci) / clusterCount - Math.PI / 2;
      const cx = clusterCount === 1 ? center.x : center.x + clusterRadius * Math.cos(angle);
      const cy = clusterCount === 1 ? center.y : center.y + clusterRadius * Math.sin(angle);
      const innerRadius = Math.max(36, Math.min(130, 26 * Math.sqrt(cluster.memberIds.length)));
      cluster.memberIds.forEach((id, mi) => {
        if (cluster.memberIds.length === 1) {
          pos[id] = { x: cx, y: cy };
          return;
        }
        const a = (2 * Math.PI * mi) / cluster.memberIds.length;
        pos[id] = { x: cx + innerRadius * Math.cos(a), y: cy + innerRadius * Math.sin(a) };
      });
    });
    return pos;
  }, [graph]);

  const clusterColor = (clusterId: string) => {
    const idx = graph.clusters.findIndex((c) => c.id === clusterId);
    return CLUSTER_PALETTE[idx % CLUSTER_PALETTE.length];
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Knowledge Silo Index</p>
          <p className="text-2xl font-bold text-white">{Math.round(graph.knowledgeSiloIndex * 100)}%</p>
        </div>
        <div className="h-8 w-px bg-slate-800" />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Clusters</p>
          <p className="text-lg font-semibold text-slate-200">{graph.clusters.length}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Isolated</p>
          <p className="text-lg font-semibold text-slate-200">{graph.isolatedNodes.length}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Bottlenecks (articulation points)</p>
          <p className="text-lg font-semibold text-slate-200">{graph.bridges.length}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 ml-auto">
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-slate-500" /> reports to
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 h-0.5 bg-cyan-400" style={{ borderTop: '1px dashed' }} /> collaboration
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-auto">
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          {graph.edges.map((e, i) => {
            const a = positions[e.from];
            const b = positions[e.to];
            if (!a || !b) return null;
            const isHovered = hovered === e.from || hovered === e.to;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.type === 'reports_to' ? '#64748b' : '#22d3ee'}
                strokeWidth={e.type === 'reports_to' ? 1.5 : Math.max(1, e.strength * 2)}
                strokeDasharray={e.type === 'collaboration' ? '4 3' : undefined}
                opacity={isHovered ? 0.95 : 0.35}
              />
            );
          })}

          {graph.nodes.map((node) => {
            const p = positions[node.id];
            if (!p) return null;
            const isIsolated = graph.isolatedNodes.includes(node.id);
            const isBridge = graph.bridges.includes(node.id);
            const radius = 14 + node.centrality * 14;
            const color = clusterColor(node.cluster);
            return (
              <g
                key={node.id}
                transform={`translate(${p.x}, ${p.y})`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(node.id)}
                className="cursor-pointer"
              >
                {isBridge && <circle r={radius + 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
                <circle
                  r={radius}
                  fill={color}
                  fillOpacity={0.85}
                  stroke={isIsolated ? '#f87171' : '#0f172a'}
                  strokeWidth={isIsolated ? 2 : 1.5}
                  strokeDasharray={isIsolated ? '3 2' : undefined}
                />
                <text textAnchor="middle" dy="4" fontSize="10" fontWeight={600} fill="#0f172a">
                  {initials(node.name)}
                </text>
                {isIsolated && (
                  <text textAnchor="middle" dy={radius + 14} fontSize="9" fontWeight={700} fill="#f87171">
                    ⚠ ISOLATED
                  </text>
                )}
                {(hovered === node.id || isBridge) && (
                  <text textAnchor="middle" dy={-radius - 8} fontSize="10" fill="#e2e8f0">
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {graph.clusters.map((c, i) => (
          <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLUSTER_PALETTE[i % CLUSTER_PALETTE.length] }} />
              <span className="text-xs font-semibold text-slate-200">{c.label}</span>
            </div>
            <p className="text-[11px] text-slate-500">{c.memberIds.length} members · cohesion {Math.round(c.cohesionScore * 100)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
