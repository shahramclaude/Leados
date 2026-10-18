"use client";

import { DOMAINS, DOMAIN_LABELS, type Domain } from "@/lib/types";

/**
 * Type contract: `Record<Domain, number>` where `Domain` is the 8-value
 * union exported from src/lib/types.ts (`DOMAINS`). Scores are 0-100 and
 * normally come from `OrchestratorResult.domainScores` — callers map
 * `{ domain, score }[]` into `Record<Domain, number>` before passing in.
 */
export interface DomainRadarProps {
  scores: Record<Domain, number>;
  priorScores?: Record<Domain, number>;
  size?: number;
}

const RINGS = [25, 50, 75, 100];

function sectorColor(score: number): string {
  if (score < 50) return "#dc2626"; // red-600, matches --severity-5
  if (score < 70) return "#d97706"; // amber-600
  return "#10b981"; // emerald-500
}

function polarPoint(cx: number, cy: number, angle: number, radius: number): [number, number] {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function buildPathD(cx: number, cy: number, maxRadius: number, values: number[]): string {
  const step = (Math.PI * 2) / values.length;
  const points = values.map((value, i) => {
    const angle = i * step - Math.PI / 2;
    const radius = (Math.max(0, Math.min(100, value)) / 100) * maxRadius;
    return polarPoint(cx, cy, angle, radius);
  });
  return (
    points
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ") + " Z"
  );
}

export default function DomainRadar({ scores, priorScores, size = 280 }: DomainRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 36;
  const step = (Math.PI * 2) / DOMAINS.length;

  const currentValues = DOMAINS.map((d) => scores[d] ?? 0);
  const priorValues = priorScores ? DOMAINS.map((d) => priorScores[d] ?? 0) : null;

  const currentPathD = buildPathD(cx, cy, maxRadius, currentValues);
  const priorPathD = priorValues ? buildPathD(cx, cy, maxRadius, priorValues) : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Org health radar across 8 domains"
      style={{ maxWidth: size, maxHeight: size }}
    >
      {/* grid rings */}
      {RINGS.map((ring) => (
        <circle
          key={ring}
          cx={cx}
          cy={cy}
          r={(ring / 100) * maxRadius}
          fill="none"
          stroke="#1e2230"
          strokeWidth={1}
        />
      ))}

      {/* axis lines + colored sector wedges */}
      {DOMAINS.map((domain, i) => {
        const angle = i * step - Math.PI / 2;
        const [x, y] = polarPoint(cx, cy, angle, maxRadius);
        const score = scores[domain] ?? 0;
        const wedgeRadius = (score / 100) * maxRadius;
        const a1 = angle - step / 2;
        const a2 = angle + step / 2;
        const [sx, sy] = polarPoint(cx, cy, a1, wedgeRadius);
        const [ex, ey] = polarPoint(cx, cy, a2, wedgeRadius);
        const labelPos = polarPoint(cx, cy, angle, maxRadius + 18);

        return (
          <g key={domain}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#1e2230" strokeWidth={1} />
            <path
              d={`M${cx},${cy} L${sx.toFixed(2)},${sy.toFixed(2)} A${wedgeRadius.toFixed(2)},${wedgeRadius.toFixed(2)} 0 0,1 ${ex.toFixed(2)},${ey.toFixed(2)} Z`}
              fill={sectorColor(score)}
              fillOpacity={0.3}
              style={{ transition: "d 0.6s ease, fill 0.6s ease" }}
            />
            <text
              x={labelPos[0]}
              y={labelPos[1]}
              fontSize={10}
              fill="#94a3b8"
              fontFamily="system-ui"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {DOMAIN_LABELS[domain]}
            </text>
          </g>
        );
      })}

      {/* ghost polygon: 7-day prior */}
      {priorPathD && (
        <path
          d={priorPathD}
          fill="#94a3b8"
          fillOpacity={0.08}
          stroke="#94a3b8"
          strokeOpacity={0.5}
          strokeDasharray="4 3"
          strokeWidth={1.5}
          style={{ transition: "d 0.6s ease" }}
        />
      )}

      {/* current filled polygon */}
      <path
        d={currentPathD}
        fill="#6366f1"
        fillOpacity={0.18}
        stroke="#818cf8"
        strokeWidth={2}
        style={{ transition: "d 0.6s ease" }}
      />

      {/* vertex dots colored by severity threshold */}
      {DOMAINS.map((domain, i) => {
        const angle = i * step - Math.PI / 2;
        const score = scores[domain] ?? 0;
        const radius = (score / 100) * maxRadius;
        const [x, y] = polarPoint(cx, cy, angle, radius);
        return (
          <circle
            key={domain}
            cx={x}
            cy={y}
            r={3.5}
            fill={sectorColor(score)}
            style={{ transition: "cx 0.6s ease, cy 0.6s ease" }}
          />
        );
      })}
    </svg>
  );
}
