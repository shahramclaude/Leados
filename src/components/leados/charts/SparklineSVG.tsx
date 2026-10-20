export function SparklineSVG({
  data,
  width = 120,
  height = 32,
  colorVar = "--accent-default",
  ariaLabel,
}: {
  data: number[];
  width?: number;
  height?: number;
  colorVar?: string;
  ariaLabel: string;
}) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label={`${ariaLabel}: no data`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--chart-grid)" strokeDasharray="2 3" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((value, index) => {
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const last = data[data.length - 1];
  const first = data[0];
  const trendUp = last >= first;

  return (
    <svg width={width} height={height} role="img" aria-label={`${ariaLabel}: ${trendUp ? "trending up" : "trending down"}, from ${first} to ${last}`}>
      <polyline fill="none" stroke={`var(${colorVar})`} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" points={points.join(" ")} />
      <circle cx={points[points.length - 1].split(",")[0]} cy={points[points.length - 1].split(",")[1]} r={2.5} fill={`var(${colorVar})`} />
    </svg>
  );
}
