"use client";

export interface CalibrationPoint {
  bucket: string;
  predictedMean: number;
  actualRate: number;
  n: number;
}

/** Reliability curve: predicted probability vs. realized outcome rate per
 * bucket. Used by the fairness report and the admin recalibration view. */
export function CalibrationCurve({ points, size = 220 }: { points: CalibrationPoint[]; size?: number }) {
  const pad = 28;
  const plot = size - pad * 2;
  const toXY = (p: number) => pad + p * plot;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Calibration curve">
      <line x1={pad} y1={size - pad} x2={size - pad} y2={pad} stroke="#e2e8f0" />
      <line x1={pad} y1={size - pad} x2={pad} y2={pad} stroke="#e2e8f0" />
      {/* perfect calibration diagonal */}
      <line x1={toXY(0)} y1={size - toXY(0)} x2={toXY(1)} y2={size - toXY(1)} stroke="#cbd5e1" strokeDasharray="4 4" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={toXY(p.predictedMean)}
          cy={size - toXY(p.actualRate)}
          r={Math.max(3, Math.min(9, Math.sqrt(p.n)))}
          fill="#4f46e5"
          fillOpacity={0.75}
        >
          <title>{`${p.bucket}: predicted ${(p.predictedMean * 100).toFixed(1)}% vs actual ${(p.actualRate * 100).toFixed(1)}% (n=${p.n})`}</title>
        </circle>
      ))}
      <text x={pad} y={size - 8} fontSize={9} fill="#64748b">
        predicted →
      </text>
      <text x={4} y={pad} fontSize={9} fill="#64748b">
        actual ↑
      </text>
    </svg>
  );
}
