import { ChartFrame, vizTitleDesc } from "./ChartFrame";
import type { RadarSeries, VizMeta } from "./types";

export function Radar({
  axes,
  series,
  meta,
  raterN,
  period,
}: {
  axes: string[];
  series: RadarSeries[];
  meta: VizMeta;
  raterN: number;
  period: string;
}) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 42;
  const scaleMax = 5;

  const angle = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  const pt = (i: number, v: number) => {
    const r = (v / scaleMax) * radius;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };

  const polygon = (values: number[]) => values.map((v, i) => pt(i, v).join(",")).join(" ");

  const self = series.find((s) => s.label.toLowerCase().includes("self"));
  const rater = series.find((s) => !s.label.toLowerCase().includes("self"));

  const table = (
    <table>
      <caption>360 assessment</caption>
      <thead>
        <tr>
          <th>axis</th>
          {series.map((s) => (
            <th key={s.label}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {axes.map((a, i) => (
          <tr key={a}>
            <td>{a}</td>
            {series.map((s) => (
              <td key={s.label}>{s.values[i]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFrame meta={meta} table={table} minHeight={size + 30}>
      {({ titleId, descId }) => (
        <div>
          <svg role="img" aria-labelledby={`${titleId} ${descId}`} width="100%" viewBox={`0 0 ${size} ${size}`}>
            {vizTitleDesc(
              "Radar chart, 360 self vs rater",
              `Self vs rater mean across ${axes.length} leadership dimensions`,
              { titleId, descId }
            )}
            {/* hexagonal grid */}
            {[1, 2, 3, 4, 5].map((level) => (
              <polygon
                key={level}
                points={axes.map((_, i) => pt(i, level).join(",")).join(" ")}
                fill="none"
                stroke="var(--line)"
                strokeWidth={1}
              />
            ))}
            {axes.map((a, i) => {
              const [ex, ey] = pt(i, scaleMax + 0.9);
              return (
                <g key={a}>
                  <line x1={cx} y1={cy} x2={pt(i, scaleMax)[0]} y2={pt(i, scaleMax)[1]} stroke="var(--line)" />
                  <text x={ex} y={ey} fontSize={8} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-2)">
                    {a}
                  </text>
                </g>
              );
            })}

            {/* blind spot / hidden strength zones */}
            {self && rater && (
              <>
                <polygon
                  points={axes.map((_, i) => pt(i, Math.max(self.values[i], rater.values[i])).join(",")).join(" ")}
                  fill="url(#hatch)"
                  opacity={0.5}
                />
              </>
            )}

            <defs>
              <pattern id="hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="4" stroke="var(--sev-4)" strokeWidth="1" />
              </pattern>
              <pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.7" fill="var(--sev-1)" />
              </pattern>
            </defs>

            {series.map((s) => (
              <polygon
                key={s.label}
                points={polygon(s.values)}
                fill={s.color}
                opacity={s.opacity ?? 0.3}
                stroke={s.color}
                strokeWidth={1.5}
              />
            ))}
          </svg>
          <div className="flex gap-3 justify-center">
            {series.map((s) => (
              <span key={s.label} className="font-mono-ui flex items-center gap-1" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-2)" }}>
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <p className="text-center font-mono-ui mt-1" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
            n={raterN} raters · {period} · labeled as self-assessment data
          </p>
        </div>
      )}
    </ChartFrame>
  );
}
