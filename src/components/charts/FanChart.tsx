"use client";
// src/components/charts/FanChart.tsx — p10/p50/p90 percentile fan, no chart library.
export default function FanChart({ p10, p50, p90 }: { p10: number[]; p50: number[]; p90: number[] }) {
  if (p50.length === 0) return <p className="text-sm text-slate-400">No data yet.</p>;
  const width = 480;
  const height = 200;
  const pad = 20;
  const all = [...p10, ...p50, ...p90];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = p50.length;

  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const band = `${p90.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} ${[...p10]
    .map((v, i) => `L ${x(n - 1 - i).toFixed(1)} ${y(p10[n - 1 - i]).toFixed(1)}`)
    .join(" ")} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[200px] w-full" role="img" aria-label="Forecast percentile fan">
      <path d={band} fill="#2563eb" opacity={0.12} />
      <path d={line(p10)} stroke="#93c5fd" strokeWidth={1.5} fill="none" />
      <path d={line(p90)} stroke="#93c5fd" strokeWidth={1.5} fill="none" />
      <path d={line(p50)} stroke="#1d4ed8" strokeWidth={2.5} fill="none" />
    </svg>
  );
}
