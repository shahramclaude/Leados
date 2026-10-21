"use client";

export interface RadarAxis {
  label: string;
  value: number; // 0-100
}

/** Minimal dependency-free SVG radar chart (Part 02 chart grammar). */
export function RadarChart({ axes, size = 240 }: { axes: RadarAxis[]; size?: number }) {
  const center = size / 2;
  const radius = size / 2 - 36;
  const n = axes.length;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;

  const points = axes.map((a, i) => {
    const r = (Math.max(0, Math.min(100, a.value)) / 100) * radius;
    const angle = angleFor(i);
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  });
  const polygon = points.map((p) => p.join(",")).join(" ");

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Team health radar">
      {rings.map((ring) => (
        <polygon
          key={ring}
          points={axes
            .map((_, i) => {
              const angle = angleFor(i);
              const r = ring * radius;
              return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {axes.map((a, i) => {
        const angle = angleFor(i);
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const lx = center + (radius + 18) * Math.cos(angle);
        const ly = center + (radius + 18) * Math.sin(angle);
        return (
          <g key={a.label}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1} />
            <text x={lx} y={ly} fontSize={10} textAnchor="middle" fill="#475569">
              {a.label}
            </text>
          </g>
        );
      })}
      <polygon points={polygon} fill="rgba(79,70,229,0.25)" stroke="#4f46e5" strokeWidth={2} />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#4f46e5" />
      ))}
    </svg>
  );
}
