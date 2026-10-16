import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { VizMeta, WaterfallItem } from "./types";

export function Waterfall({ items, meta, unit = "$k" }: { items: WaterfallItem[]; meta: VizMeta; unit?: string }) {
  const width = 480;
  const height = 220;
  const pad = { top: 16, right: 10, bottom: 34, left: 10 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const bw = innerW / items.length - 14;

  let running = 0;
  const bars = items.map((it) => {
    let start: number, end: number;
    if (it.type === "base" || it.type === "total") {
      start = 0;
      end = it.value;
      running = it.value;
    } else {
      start = running;
      end = running + it.value;
      running = end;
    }
    return { ...it, start, end };
  });

  const maxVal = Math.max(...bars.map((b) => Math.max(b.start, b.end)), 0);
  const minVal = Math.min(...bars.map((b) => Math.min(b.start, b.end)), 0);
  const y = (v: number) => pad.top + innerH - ((v - minVal) / (maxVal - minVal || 1)) * innerH;
  const x = (i: number) => pad.left + i * (innerW / items.length) + 7;

  const colorFor = (t: WaterfallItem["type"]) =>
    t === "add" ? "var(--sev-1)" : t === "subtract" ? "var(--sev-5)" : "var(--ink-1)";

  const table = (
    <table>
      <caption>{meta.label}</caption>
      <thead>
        <tr>
          <th>label</th>
          <th>value</th>
          <th>running total</th>
        </tr>
      </thead>
      <tbody>
        {bars.map((b) => (
          <tr key={b.label}>
            <td>{b.label}</td>
            <td>
              {b.value}
              {unit}
            </td>
            <td>
              {b.end}
              {unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={height}>
      {({ titleId, descId }) => (
        <svg role="img" aria-labelledby={`${titleId} ${descId}`} width="100%" viewBox={`0 0 ${width} ${height}`}>
          {vizTitleDesc(
            "Waterfall chart",
            `${items[0]?.label} of ${items[0]?.value}${unit} bridging to ${items[items.length - 1]?.label} of ${bars[bars.length - 1]?.end}${unit}`,
            { titleId, descId }
          )}
          {bars.map((_b, i) =>
            i === 0 ? null : (
              <line
                key={"c" + i}
                x1={x(i - 1) + bw}
                x2={x(i)}
                y1={y(bars[i - 1].end)}
                y2={y(bars[i - 1].end)}
                stroke="var(--ink-4)"
                strokeDasharray="3 2"
              />
            )
          )}
          {bars.map((b, i) => (
            <g key={b.label}>
              <rect
                x={x(i)}
                y={y(Math.max(b.start, b.end))}
                width={bw}
                height={Math.max(2, Math.abs(y(b.start) - y(b.end)))}
                fill={colorFor(b.type)}
              />
              <text x={x(i) + bw / 2} y={y(Math.max(b.start, b.end)) - 6} fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-1)">
                {b.end}
                {unit}
              </text>
              <text x={x(i) + bw / 2} y={height - 18} fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-3)">
                {b.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </ChartFrame>
  );
}
