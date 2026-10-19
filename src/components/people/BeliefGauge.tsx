interface BeliefGaugeProps {
  label: string;
  value: number; // 0-100
  colorClass?: string;
  trackClass?: string;
  size?: number;
  subtitle?: string;
}

/** Circular 0-100 gauge used across the People Intelligence dashboard. */
export function BeliefGauge({ label, value, colorClass, trackClass = 'stroke-slate-700', size = 92, subtitle }: BeliefGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const resolvedColor = colorClass ?? autoColor(clamped);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={8} fill="none" className={trackClass} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={8}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={resolvedColor}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-white">{Math.round(clamped)}</span>
          {subtitle && <span className="text-[9px] uppercase tracking-wide text-slate-400">{subtitle}</span>}
        </div>
      </div>
      <span className="text-xs font-medium text-slate-300 text-center">{label}</span>
    </div>
  );
}

function autoColor(value: number) {
  if (value >= 70) return 'stroke-rose-500';
  if (value >= 50) return 'stroke-amber-500';
  if (value >= 30) return 'stroke-yellow-400';
  return 'stroke-emerald-500';
}

export function MiniRing({ value, size = 36 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 70 ? 'stroke-emerald-400' : clamped >= 40 ? 'stroke-amber-400' : 'stroke-rose-400';
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={4} fill="none" className="stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={4}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
        {Math.round(clamped)}
      </div>
    </div>
  );
}
