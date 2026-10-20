import type { HeatmapCell } from "./types";
import { SEVERITY_META, type SeverityLevel } from "../ui/tokens";

export interface HeatmapSVGProps {
  rows: string[];
  cols: string[];
  cells: HeatmapCell[];
  /** Maps a raw value to a 1–5 severity bucket; color AND the severity
   * glyph are both rendered per cell. */
  toSeverity: (value: number) => SeverityLevel;
  cellSize?: number;
}

export function HeatmapSVG({ rows, cols, cells, toSeverity, cellSize = 34 }: HeatmapSVGProps) {
  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c.value]));
  const labelColWidth = 120;
  const width = labelColWidth + cols.length * cellSize;
  const height = 24 + rows.length * cellSize;

  return (
    <svg role="img" aria-label="Heatmap" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {cols.map((col, ci) => (
        <text key={col} x={labelColWidth + ci * cellSize + cellSize / 2} y={14} textAnchor="middle" fontSize={10} fill="var(--text-muted)">
          {col}
        </text>
      ))}
      {rows.map((row, ri) => (
        <g key={row}>
          <text x={labelColWidth - 8} y={24 + ri * cellSize + cellSize / 2 + 4} textAnchor="end" fontSize={11} fill="var(--text-secondary)">
            {row}
          </text>
          {cols.map((col, ci) => {
            const value = lookup.get(`${row}|${col}`);
            if (value === undefined) {
              return (
                <rect
                  key={col}
                  x={labelColWidth + ci * cellSize}
                  y={24 + ri * cellSize}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  fill="var(--surface-sunken)"
                />
              );
            }
            const severity = toSeverity(value);
            const meta = SEVERITY_META[severity];
            return (
              <g key={col}>
                <rect
                  x={labelColWidth + ci * cellSize}
                  y={24 + ri * cellSize}
                  width={cellSize - 2}
                  height={cellSize - 2}
                  fill={`var(${meta.var})`}
                  opacity={0.85}
                  rx={3}
                >
                  <title>
                    {row} × {col}: {value} ({meta.label})
                  </title>
                </rect>
                <text
                  x={labelColWidth + ci * cellSize + (cellSize - 2) / 2}
                  y={24 + ri * cellSize + (cellSize - 2) / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--text-inverse)"
                  aria-hidden
                >
                  {meta.shape}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
