import type { SceneNode } from "@/types/spatial";

/** 2D semantic-equivalent for the scenario-landscape scene. Each axis is a
 * strong position/length channel; this is the mandated fallback for exact
 * reading of the three quantitative drivers that the 3D view also shows. */
export function ParallelCoordinates({
  nodes,
  colorFor,
  selectedId,
  onSelect,
}: {
  nodes: SceneNode[];
  colorFor: (n: SceneNode) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const axes: { key: string; label: string; get: (n: SceneNode) => number }[] = [
    { key: "demandDriver", label: "Demand driver", get: (n) => Number(n.fields.demandDriver) },
    { key: "costDriver", label: "Cost driver", get: (n) => Number(n.fields.costDriver) },
    { key: "twinOutcomeUsdM", label: "Twin outcome ($M)", get: (n) => n.magnitude },
  ];

  const width = 520;
  const height = 320;
  const pad = 40;
  const axisX = (i: number) => pad + (i * (width - pad * 2)) / (axes.length - 1);

  const ranges = axes.map((ax) => {
    const values = nodes.map(ax.get);
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  const yFor = (axisIdx: number, value: number) => {
    const { min, max } = ranges[axisIdx];
    const t = (value - min) / Math.max(1e-6, max - min);
    return height - pad - t * (height - pad * 2);
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Parallel coordinates chart, equivalent to the 3D scenario landscape">
      <rect x={0} y={0} width={width} height={height} fill="#f8fafc" rx={12} />
      {axes.map((ax, i) => (
        <g key={ax.key}>
          <line x1={axisX(i)} y1={pad} x2={axisX(i)} y2={height - pad} stroke="#cbd5e1" />
          <text x={axisX(i)} y={pad - 12} textAnchor="middle" fontSize={11} fill="#334155">
            {ax.label}
          </text>
          <text x={axisX(i)} y={height - pad + 16} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {ranges[i].min.toFixed(0)}
          </text>
          <text x={axisX(i)} y={pad - 2} textAnchor="middle" fontSize={10} fill="#94a3b8">
            {ranges[i].max.toFixed(0)}
          </text>
        </g>
      ))}
      {nodes.map((n) => {
        const points = axes.map((ax, i) => `${axisX(i)},${yFor(i, ax.get(n))}`).join(" ");
        const isSelected = n.id === selectedId;
        return (
          <polyline
            key={n.id}
            points={points}
            fill="none"
            stroke={colorFor(n)}
            strokeWidth={isSelected ? 3 : 1.25}
            opacity={isSelected ? 1 : 0.45}
            tabIndex={0}
            role="button"
            aria-label={`${n.label}: demand ${n.fields.demandDriver}, cost ${n.fields.costDriver}, outcome ${n.magnitude}`}
            onClick={() => onSelect(n.id)}
            onFocus={() => onSelect(n.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onSelect(n.id);
            }}
            className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          />
        );
      })}
    </svg>
  );
}
