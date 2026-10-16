import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { BulletMetric, VizMeta } from "./types";

export function BulletGraph({ metric, meta }: { metric: BulletMetric; meta: VizMeta }) {
  const width = 460;
  const height = 54;
  const padLeft = 160;
  const padRight = 70;
  const barX = padLeft;
  const barW = width - padLeft - padRight;
  const lo = Math.min(...metric.ranges.map((r) => r.lo));
  const hi = Math.max(...metric.ranges.map((r) => r.hi));
  const scale = (v: number) => barX + ((v - lo) / (hi - lo)) * barW;
  const delta = metric.actual - metric.target;
  const deltaPct = metric.target !== 0 ? (delta / metric.target) * 100 : 0;

  const table = (
    <table>
      <caption>{metric.label}</caption>
      <tbody>
        <tr>
          <th>actual</th>
          <td>
            {metric.actual}
            {metric.unit ?? ""}
          </td>
        </tr>
        <tr>
          <th>target</th>
          <td>
            {metric.target}
            {metric.unit ?? ""}
          </td>
        </tr>
        <tr>
          <th>delta</th>
          <td>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}
            {metric.unit ?? ""}
          </td>
        </tr>
        {metric.ranges.map((r) => (
          <tr key={r.label}>
            <th>{r.label} range</th>
            <td>
              {r.lo}–{r.hi}
            </td>
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
            `Bullet graph: ${metric.label}`,
            `${metric.label} actual ${metric.actual}${metric.unit ?? ""} vs target ${metric.target}${metric.unit ?? ""}, delta ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}${metric.unit ?? ""}`,
            { titleId, descId }
          )}
          <text x={0} y={18} fontSize={10} fontFamily="var(--font-mono)" fill="var(--ink-1)">
            {metric.label}
          </text>
          <text x={0} y={34} fontSize={9} fontFamily="var(--font-mono)" fill="var(--ink-2)">
            {metric.actual}
            {metric.unit ?? ""} / {metric.target}
            {metric.unit ?? ""}
          </text>
          <text
            x={0}
            y={46}
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill={delta >= 0 ? "var(--sev-1)" : "var(--sev-5)"}
          >
            {delta >= 0 ? "+" : ""}
            {deltaPct.toFixed(0)}% vs target
          </text>

          {/* range bands */}
          {metric.ranges.map((r) => (
            <rect
              key={r.label}
              x={scale(r.lo)}
              y={14}
              width={scale(r.hi) - scale(r.lo)}
              height={16}
              fill={r.color}
              opacity={0.28}
            />
          ))}
          {metric.ranges.map((r) => (
            <text
              key={r.label + "l"}
              x={(scale(r.lo) + scale(r.hi)) / 2}
              y={44}
              fontSize={7}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fill="var(--ink-3)"
            >
              {r.label}
            </text>
          ))}

          {/* prior period comparative bar */}
          {metric.prior !== undefined && (
            <rect x={barX} y={18} width={scale(metric.prior) - barX} height={4} fill="var(--ink-4)" />
          )}

          {/* actual bar */}
          <rect x={barX} y={24} width={Math.max(0, scale(metric.actual) - barX)} height={6} fill="var(--ink-1)" />

          {/* target marker */}
          <line x1={scale(metric.target)} x2={scale(metric.target)} y1={10} y2={34} stroke="var(--ink-1)" strokeWidth={2} />
        </svg>
      )}
    </ChartFrame>
  );
}
