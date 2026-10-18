"use client";

interface SparklineSVGProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  fill?: boolean;
}

export function SparklineSVG({
  values,
  width = 120,
  height = 32,
  color = "#64748b",
  strokeWidth = 1.75,
  fill = true,
}: SparklineSVGProps) {
  if (!values.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="opacity-40">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeDasharray="2 3" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padY = height * 0.12;

  const pts = values.map((v, i) => {
    const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
    const y = height - padY - ((v - min) / span) * (height - padY * 2);
    return [x, y] as const;
  });

  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && <path d={areaPath} fill={color} opacity={0.12} stroke="none" />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.25} fill={color} />
    </svg>
  );
}
