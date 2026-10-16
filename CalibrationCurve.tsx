import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { CalibrationBucket, VizMeta } from "./types";

export function CalibrationCurve({
  buckets,
  meta,
  totalN,
  sampleMin,
  windowDays,
}: {
  buckets: CalibrationBucket[];
  meta: VizMeta;
  totalN: number;
  sampleMin: number;
  windowDays: number;
}) {
  if (totalN < sampleMin) {
    return (
      <div className="rounded border p-4 text-center" style={{ borderColor: "var(--line)" }}>
        <p className="font-mono-ui" style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
          Not enough calibration data (n={totalN}).
          <br />
          Log {sampleMin - totalN} more decisions at #/self → Calibration.
        </p>
      </div>
    );
  }

  const width = 320;
  const height = 320;
  const pad = 36;
  const inner = width - pad * 2;
  const x = (v: number) => pad + (v / 100) * inner;
  const y = (v: number) => height - pad - (v / 100) * inner;

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>stated confidence</th>
          <th>accuracy</th>
          <th>n</th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((b) => (
          <tr key={b.bucketLabel}>
            <td>{b.bucketLabel}</td>
            <td>{b.accuracy}%</td>
            <td>{b.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height + 20}>
      {({ titleId, descId }) => (
        <div>
          <svg role="img" aria-labelledby={`${titleId} ${descId}`} width="100%" viewBox={`0 0 ${width} ${height}`}>
            {vizTitleDesc(
              "Calibration curve",
              `Across ${buckets.length} confidence buckets, stated confidence vs actual accuracy`,
              { titleId, descId }
            )}
            <line x1={x(0)} y1={y(0)} x2={x(100)} y2={y(100)} stroke="var(--ink-4)" strokeDasharray="4 3" />
            <text x={x(78)} y={y(88)} fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              perfect calibration
            </text>
            <text x={pad + 4} y={pad - 10} fontSize={8} fontFamily="var(--font-mono)" fill="var(--sev-1)">
              ↖ underconfident
            </text>
            <text x={width - pad - 90} y={height - pad + 20} fontSize={8} fontFamily="var(--font-mono)" fill="var(--sev-5)">
              overconfident ↘
            </text>
            <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--ink-3)" />
            <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="var(--ink-3)" />
            <text x={pad} y={height - 10} fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-3)">
              stated confidence →
            </text>
            <text x={6} y={pad} fontSize={8} fontFamily="var(--font-mono)" fill="var(--ink-3)" transform={`rotate(-90 6 ${pad})`}>
              accuracy →
            </text>
            {buckets.map((b) => (
              <g key={b.bucketLabel}>
                <circle cx={x(b.statedMid)} cy={y(b.accuracy)} r={3 + b.n * 0.6} fill="var(--accent)" opacity={0.6} />
                <text x={x(b.statedMid)} y={y(b.accuracy) - 10 - b.n * 0.6} fontSize={7} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-2)">
                  n={b.n}, {b.accuracy}%
                </text>
              </g>
            ))}
          </svg>
          <p className="text-center font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            n={totalN} decisions calibrated in {windowDays}d window. Minimum {sampleMin} required to display.
          </p>
        </div>
      )}
    </ChartFrame>
  );
}
