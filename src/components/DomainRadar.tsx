"use client";

import { useEffect, useState } from "react";
import { DOMAIN_META, DOMAIN_ORDER } from "@/lib/domains";
import type { Domain } from "@/lib/types";

// -----------------------------------------------------------------------
// Coordinate system: viewBox "0 0 260 260".
// Units: abstract SVG user units. Center is (130, 130). The plot radius
// (distance representing a score of 100) is 95 units, leaving a 35-unit
// margin around the outside of the chart for axis labels so text never
// clips the viewBox regardless of the rendered `size`.
// 8 axes are spaced at 45 degree intervals starting at -90deg (straight
// up) so the first domain always points to 12 o'clock, matching the
// reading order of the domain score table beneath it.
// -----------------------------------------------------------------------

interface DomainRadarProps {
  scores: Record<Domain, number>;
  priorScores?: Record<Domain, number>;
  size?: number;
}

const CENTER = 130;
const PLOT_R = 95;
const LABEL_R = 118;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointFor(index: number, fraction: number) {
  const angle = -90 + index * 45; // degrees, -90 = straight up
  const rad = (angle * Math.PI) / 180;
  return {
    x: CENTER + PLOT_R * fraction * Math.cos(rad),
    y: CENTER + PLOT_R * fraction * Math.sin(rad),
  };
}

function polygonPoints(scores: Record<Domain, number>) {
  return DOMAIN_ORDER.map((domain, i) => {
    const fraction = Math.max(0, Math.min(1, scores[domain] / 100));
    const p = pointFor(i, fraction);
    return `${p.x},${p.y}`;
  }).join(" ");
}

export default function DomainRadar({ scores, priorScores, size = 240 }: DomainRadarProps) {
  const [flashed, setFlashed] = useState(false);
  useEffect(() => {
    // Trigger the one-time "score dropped" flash exactly once on mount,
    // per the spec: diagnostic flash, not a decorative loop.
    const t = setTimeout(() => setFlashed(true), 50);
    return () => clearTimeout(t);
  }, []);

  const currentPoly = polygonPoints(scores);
  const priorPoly = priorScores ? polygonPoints(priorScores) : null;

  return (
    <svg viewBox="0 0 260 260" width={size} height={size} role="img" aria-label="Domain health radar">
      {/* background grid rings, purely structural */}
      {RINGS.map((f) => (
        <polygon
          key={f}
          points={DOMAIN_ORDER.map((_, i) => {
            const p = pointFor(i, f);
            return `${p.x},${p.y}`;
          }).join(" ")}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={1}
        />
      ))}

      {/* axis spokes, colored per-domain, flashed once if score dropped >10 */}
      {DOMAIN_ORDER.map((domain, i) => {
        const outer = pointFor(i, 1);
        const dropped = priorScores ? priorScores[domain] - scores[domain] > 10 : false;
        return (
          <line
            key={domain}
            x1={CENTER}
            y1={CENTER}
            x2={outer.x}
            y2={outer.y}
            stroke={DOMAIN_META[domain].color}
            strokeOpacity={0.45}
            strokeWidth={1}
            className={dropped && flashed ? "leados-axis-flash" : undefined}
          />
        );
      })}

      {priorPoly && (
        <polygon
          points={priorPoly}
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      <polygon
        points={currentPoly}
        fill="rgba(99, 102, 241, 0.18)"
        stroke="var(--accent-indigo-400)"
        strokeWidth={2}
      />

      {DOMAIN_ORDER.map((domain, i) => {
        const fraction = Math.max(0, Math.min(1, scores[domain] / 100));
        const p = pointFor(i, fraction);
        return <circle key={domain} cx={p.x} cy={p.y} r={3} fill={DOMAIN_META[domain].color} />;
      })}

      {DOMAIN_ORDER.map((domain, i) => {
        const labelPoint = pointFor(i, LABEL_R / PLOT_R);
        return (
          <text
            key={domain}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="var(--font-mono)"
            fontSize="9"
            fill="var(--text-secondary)"
          >
            {DOMAIN_META[domain].short}
          </text>
        );
      })}
    </svg>
  );
}
