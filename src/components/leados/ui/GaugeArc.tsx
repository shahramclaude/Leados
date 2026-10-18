"use client";

interface GaugeArcProps {
  label: string;
  value: number; // 0-100
  size?: number;
}

function colorForValue(value: number): string {
  if (value >= 75) return "#22c55e";
  if (value >= 55) return "#eab308";
  if (value >= 35) return "#f97316";
  return "#ef4444";
}

export default function GaugeArc({ label, value, size = 96 }: GaugeArcProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = size / 2 - 8;
  const circumference = Math.PI * radius; // half circle arc length
  const offset = circumference * (1 - clamped / 100);
  const color = colorForValue(clamped);

  return (
    <div className="flex flex-col items-center gap-1" data-testid={`gauge-${label}`}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke="#1e293b"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 8} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.6s ease" }}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="fill-slate-100" fontSize={18} fontWeight={700}>
          {Math.round(clamped)}
        </text>
      </svg>
      <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}
