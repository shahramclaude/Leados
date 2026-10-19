import type { Domain } from "../lib/types";
import { scoreAtDaysAgo } from "../lib/orgPhysics";

// ─────────────────────────────────────────────────────────────
// DomainRadar — pure SVG org-health radar chart.
//
// viewBox: "0 0 240 240" — a fixed 240×240 internal coordinate
// system regardless of rendered size, so the `size` prop can
// scale the chart (240 desktop → 160 mobile) via width/height
// without recomputing any geometry.
//
// Coordinate system: origin (0,0) top-left, center at (120,120).
// Radius of 80 for the outer (score=10) ring leaves an 18px
// margin (240/2 - 80 - 22 label offset) so the 8 axis labels at
// radius 102 stay inside the viewBox without clipping.
//
// 8 axes, one per domain, spaced 45° apart starting at -90°
// (straight up) and proceeding clockwise — matches a compass/
// radar reading convention so "up" is always the first domain.
// ─────────────────────────────────────────────────────────────

const SIZE = 240;
const CENTER = SIZE / 2;
const R_OUTER = 80;
const R_LABEL = 102;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointFor(index: number, total: number, radius: number) {
  const angle = (-90 + index * (360 / total)) * (Math.PI / 180);
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

export function DomainRadar({
  domains,
  orgHealthScore,
  size = 240,
}: {
  domains: Domain[];
  orgHealthScore: number;
  size?: number;
}) {
  const n = domains.length;

  const currentPts = domains.map((d, i) => pointFor(i, n, R_OUTER * (d.score / 10)));
  const ghostPts = domains.map((d, i) => pointFor(i, n, R_OUTER * (scoreAtDaysAgo(d, 7) / 10)));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      className="overflow-visible"
      role="img"
      aria-label="Organizational health radar, current vs 7 days ago"
    >
      {/* Grid rings: concentric octagons at 25/50/75/100% radius, pure reference geometry */}
      {RINGS.map((frac) => (
        <polygon
          key={frac}
          points={domains.map((_, i) => pointFor(i, n, R_OUTER * frac)).map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* Axis spokes from center to outer ring */}
      {domains.map((_, i) => {
        const p = pointFor(i, n, R_OUTER);
        return (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={p.x}
            y2={p.y}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
        );
      })}

      {/* Ghost polygon: scores 7 days ago, dashed muted stroke, no fill emphasis */}
      <path d={toPath(ghostPts)} fill="none" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3,3" />

      {/* Current polygon: solid accent stroke + translucent fill */}
      <path
        d={toPath(currentPts)}
        fill="color-mix(in srgb, var(--text-accent) 16%, transparent)"
        stroke="var(--text-accent)"
        strokeWidth={1.5}
      />

      {/* Axis tip dots, colored per domain */}
      {domains.map((d, i) => {
        const p = pointFor(i, n, R_OUTER * (d.score / 10));
        return <circle key={d.key} cx={p.x} cy={p.y} r={2.75} fill={`var(${d.colorVar})`} />;
      })}

      {/* Axis labels: colored by 7-day delta (red = dropped >1.5, green = gained >1.5) */}
      {domains.map((d, i) => {
        const past = scoreAtDaysAgo(d, 7);
        const delta = d.score - past;
        const color = delta <= -1.5 ? "var(--health-critical)" : delta >= 1.5 ? "var(--health-green)" : "var(--text-muted)";
        const p = pointFor(i, n, R_LABEL);
        const anchor = Math.abs(p.x - CENTER) < 4 ? "middle" : p.x > CENTER ? "start" : "end";
        return (
          <text
            key={d.key}
            x={p.x}
            y={p.y}
            fill={color}
            fontSize={7}
            fontFamily="var(--font-mono)"
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {d.name.toUpperCase()}
          </text>
        );
      })}

      {/* Center readout: org health score large, label below */}
      <text x={CENTER} y={CENTER - 4} textAnchor="middle" fontSize={26} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--text-primary)">
        {orgHealthScore}
      </text>
      <text x={CENTER} y={CENTER + 12} textAnchor="middle" fontSize={7} letterSpacing={1.5} fontFamily="var(--font-mono)" fill="var(--text-muted)">
        HEALTH
      </text>
    </svg>
  );
}
