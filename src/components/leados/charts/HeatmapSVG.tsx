export interface HeatmapCell {
  row: string;
  col: string;
  value: number; // 0-1 normalized intensity
  label?: string;
}

/** Severity-style heatmap: intensity by color AND by printed value, never color alone. */
export function HeatmapSVG({
  rows,
  cols,
  cells,
  cellSize = 36,
}: {
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
  cellSize?: number;
}) {
  const labelWidth = 96;
  const width = labelWidth + cols.length * cellSize;
  const height = 24 + rows.length * cellSize;
  const lookup = new Map(cells.map((c) => [`${c.row}__${c.col}`, c]));

  function colorFor(value: number) {
    // Light-to-dark accent ramp driven by the semantic accent token via opacity (no raw hex).
    const alpha = 0.12 + value * 0.72;
    return `color-mix(in srgb, var(--accent-default) ${Math.round(alpha * 100)}%, var(--surface-base))`;
  }

  return (
    <svg width={width} height={height} role="img" aria-label="Heatmap">
      {cols.map((c, ci) => (
        <text key={c} x={labelWidth + ci * cellSize + cellSize / 2} y={14} textAnchor="middle" className="fill-text-muted text-[10px]">
          {c}
        </text>
      ))}
      {rows.map((r, ri) => (
        <g key={r}>
          <text x={labelWidth - 8} y={24 + ri * cellSize + cellSize / 2} dy="0.32em" textAnchor="end" className="fill-text-secondary text-[11px]">
            {r}
          </text>
          {cols.map((c, ci) => {
            const cell = lookup.get(`${r}__${c}`);
            const value = cell?.value ?? 0;
            return (
              <g key={c}>
                <rect
                  x={labelWidth + ci * cellSize}
                  y={24 + ri * cellSize}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  rx={4}
                  fill={colorFor(value)}
                  stroke="var(--border-subtle)"
                />
                <text
                  x={labelWidth + ci * cellSize + cellSize / 2}
                  y={24 + ri * cellSize + cellSize / 2}
                  dy="0.32em"
                  textAnchor="middle"
                  className="fill-text-primary font-mono text-[10px] tabular-nums"
                >
                  {cell?.label ?? Math.round(value * 100)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
