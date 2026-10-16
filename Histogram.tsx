import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { HistogramBucket, VizMeta } from "./types";

export function Histogram({
  buckets,
  meta,
  meanLabel,
}: {
  buckets: HistogramBucket[];
  meta: VizMeta;
  meanLabel?: string;
}) {
  const width = 420;
  const height = 180;
  const pad = { top: 18, right: 10, bottom: 34, left: 10 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const bw = innerW / buckets.length - 8;

  const total = buckets.reduce((a, b) => a + b.count, 0);
  const cum: number[] = [];
  buckets.reduce((acc, b) => {
    const next = acc + b.count;
    cum.push(next);
    return next;
  }, 0);
  function percentileBucket(p: number) {
    const target = total * p;
    const idx = cum.findIndex((c) => c >= target);
    return idx === -1 ? buckets.length - 1 : idx;
  }
  const p25 = percentileBucket(0.25);
  const p50 = percentileBucket(0.5);
  const p75 = percentileBucket(0.75);
  const meanIdx =
    buckets.reduce((acc, b, i) => acc + b.count * i, 0) / (total || 1);

  const x = (i: number) => pad.left + i * (innerW / buckets.length) + 4;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>bucket</th>
          <th>count</th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => (
          <tr key={b.label}>
            <td>{b.label}</td>
            <td>{b.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height}>
      {({ titleId, descId }) => (
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} width="100%" viewBox={`0 0 ${width} ${height}`}>
          {vizTitleDesc("Histogram", `${total} observations across ${buckets.length} buckets`, {
            titleId,
            descId,
          })}
          {buckets.map((b, i) => (
            <g key={b.label}>
              <rect x={x(i)} y={y(b.count)} width={bw} height={innerH - (y(b.count) - pad.top)} fill="var(--accent)" opacity={0.75} />
              <text x={x(i) + bw / 2} y={y(b.count) - 4} fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-1)">
                {b.count}
              </text>
              <text x={x(i) + bw / 2} y={height - 18} fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-3)">
                {b.label}
              </text>
              {(i === p25 || i === p50 || i === p75) && (
                <text x={x(i) + bw / 2} y={height - 6} fontSize={7} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-2)">
                  {[i === p25 && "P25", i === p50 && "P50", i === p75 && "P75"].filter(Boolean).join("/")}
                </text>
              )}
            </g>
          ))}
          <line
            x1={x(meanIdx) + bw / 2}
            x2={x(meanIdx) + bw / 2}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="var(--sev-5)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <text x={x(meanIdx) + bw / 2 + 3} y={pad.top + 8} fontSize={8} fontFamily="var(--font-mono)" fill="var(--sev-5)">
            {meanLabel ?? "mean"}
          </text>
        </svg>
      )}
    </ChartFrame>
  );
}
