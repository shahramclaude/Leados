export interface WaterfallStep {
  label: string;
  delta: number;
  kind: "total" | "increase" | "decrease";
}

/** Revenue-to-net bridge. Direction is always color + sign + label, never color alone. */
export function WaterfallSVG({ steps, width = 560, height = 260, format }: { steps: WaterfallStep[]; width?: number; height?: number; format: (n: number) => string }) {
  const margin = { top: 16, right: 16, bottom: 48, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const barWidth = innerWidth / steps.length - 12;

  let running = 0;
  const bars = steps.map((step) => {
    const start = step.kind === "total" ? 0 : running;
    const end = step.kind === "total" ? step.delta : running + step.delta;
    running = step.kind === "total" ? step.delta : end;
    return { ...step, start, end };
  });

  const maxValue = Math.max(...bars.map((b) => Math.max(b.start, b.end)), 1);
  const minValue = Math.min(...bars.map((b) => Math.min(b.start, b.end)), 0);
  const domain = maxValue - minValue || 1;

  function y(value: number) {
    return innerHeight - ((value - minValue) / domain) * innerHeight;
  }

  return (
    <figure className="flex flex-col gap-3">
      <svg width={width} height={height} role="img" aria-label="Revenue to net income bridge">
        <g transform={`translate(${margin.left},${margin.top})`}>
          <line x1={0} y1={y(0)} x2={innerWidth} y2={y(0)} stroke="var(--chart-axis)" strokeWidth={1} />
          {bars.map((bar, i) => {
            const x = i * (barWidth + 12);
            const top = y(Math.max(bar.start, bar.end));
            const barHeight = Math.abs(y(bar.start) - y(bar.end)) || 2;
            const color = bar.kind === "total" ? "var(--chart-series-1)" : bar.kind === "increase" ? "var(--status-success)" : "var(--status-danger)";
            const sign = bar.kind === "decrease" ? "−" : bar.kind === "increase" ? "+" : "";
            return (
              <g key={bar.label}>
                <rect x={x} y={bar.kind === "total" ? y(bar.delta) : top} width={barWidth} height={bar.kind === "total" ? Math.abs(y(0) - y(bar.delta)) : barHeight} fill={color} rx={3} />
                <text x={x + barWidth / 2} y={top - 6} textAnchor="middle" className="fill-text-primary font-mono text-[11px] tabular-nums">
                  {sign}
                  {format(Math.abs(bar.delta))}
                </text>
                <text x={x + barWidth / 2} y={innerHeight + 16} textAnchor="middle" className="fill-text-muted text-[10px]">
                  {bar.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}
