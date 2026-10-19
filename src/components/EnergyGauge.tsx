/** Horizontal fuel-gauge SVG: red (depleted) → amber → green (full), with a marker at the current score. */
export function EnergyGauge({ score, width = 560, height = 46 }: { score: number; width?: number; height?: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const markerX = (pct / 100) * width;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Leadership energy gauge, ${score} of 100`}>
        <defs>
          <linearGradient id="fuelGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--bad)" />
            <stop offset="50%" stopColor="var(--warn)" />
            <stop offset="100%" stopColor="var(--ok)" />
          </linearGradient>
        </defs>
        <rect x={0} y={height / 2 - 10} width={width} height={20} rx={10} fill="var(--panel2)" stroke="var(--line)" />
        <rect x={0} y={height / 2 - 10} width={width} height={20} rx={10} fill="url(#fuelGradient)" opacity={0.85} />
        <rect
          x={Math.max(0, markerX)}
          y={height / 2 - 10}
          width={Math.max(0, width - markerX)}
          height={20}
          rx={10}
          fill="var(--bg)"
          opacity={0.78}
        />
        <line x1={markerX} y1={height / 2 - 16} x2={markerX} y2={height / 2 + 16} stroke="var(--text)" strokeWidth={3} />
        <circle cx={markerX} cy={height / 2 - 16} r={3.5} fill="var(--text)" />
      </svg>
      <div className="mt-1 flex justify-between font-mono-ui text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>DEPLETED</span>
        <span style={{ color: "var(--text)" }}>{Math.round(pct)}/100</span>
        <span>FULL</span>
      </div>
    </div>
  );
}
