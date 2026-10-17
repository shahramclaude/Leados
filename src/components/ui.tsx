import type { ReactNode } from "react";

export function Card({ title, subtitle, children, className = "" }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, tone = "slate" }: { label: string; value: ReactNode; tone?: "slate" | "emerald" | "rose" | "amber" | "indigo" }) {
  const tones: Record<string, string> = {
    slate: "text-slate-900",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    indigo: "text-indigo-600",
  };
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "emerald" | "rose" | "amber" | "indigo" | "violet" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-indigo-100 text-indigo-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Bar({ value, max = 100, tone = "indigo" }: { value: number; max?: number; tone?: "indigo" | "emerald" | "rose" | "amber" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tones: Record<string, string> = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tones[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="tabular-nums text-slate-400">{value}{hint}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </label>
  );
}

export function RadarChart({ dims, size = 260 }: { dims: { label: string; score: number }[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const n = dims.length;

  const points = dims.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (d.score / 100) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const;
  });

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridLevels.map((lvl) => (
        <polygon
          key={lvl}
          points={dims
            .map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const r = lvl * radius;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {dims.map((d, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const lx = center + (radius + 24) * Math.cos(angle);
        const ly = center + (radius + 24) * Math.sin(angle);
        return (
          <g key={d.label}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={lx} y={ly} fontSize={9} textAnchor="middle" fill="#64748b">
              {d.label}
            </text>
          </g>
        );
      })}
      <polygon points={points.map((p) => p.join(",")).join(" ")} fill="#6366f1" fillOpacity={0.25} stroke="#6366f1" strokeWidth={2} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#4f46e5" />
      ))}
    </svg>
  );
}
