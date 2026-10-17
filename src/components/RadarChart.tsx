// Original SVG radar chart, written for this delivery (no charting library).
import type { DimensionResult } from "../lib/types";

export function RadarChart({ dimensions }: { dimensions: DimensionResult[] }) {
  const size = 420;
  const center = size / 2;
  const radius = size / 2 - 64;
  const maxScore = 5;
  const n = dimensions.length;

  const pointFor = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    const r = (value / maxScore) * radius;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)] as const;
  };

  const ringPolygons = [1, 2, 3, 4, 5].map((level) => {
    const pts = dimensions.map((_, i) => pointFor(i, level).join(",")).join(" ");
    return { level, pts };
  });

  const valuePts = dimensions.map((d, i) => pointFor(i, d.score).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[420px] w-full max-w-[420px]">
      {ringPolygons.map((ring) => (
        <polygon
          key={ring.level}
          points={ring.pts}
          fill="none"
          stroke={ring.level === 5 ? "#475569" : "#1e293b"}
          strokeWidth={1}
        />
      ))}
      {dimensions.map((_, i) => {
        const [x, y] = pointFor(i, maxScore);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#1e293b" strokeWidth={1} />;
      })}
      <polygon points={valuePts} fill="rgba(139,92,246,0.35)" stroke="#8b5cf6" strokeWidth={2} />
      {dimensions.map((d, i) => {
        const [x, y] = pointFor(i, d.score);
        return <circle key={d.key} cx={x} cy={y} r={3.5} fill="#c4b5fd" stroke="#8b5cf6" strokeWidth={1} />;
      })}
      {dimensions.map((d, i) => {
        const [lx, ly] = pointFor(i, maxScore + 1.35);
        return (
          <text
            key={`label-${d.key}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-300"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {d.name}
          </text>
        );
      })}
    </svg>
  );
}
