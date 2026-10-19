"use client";

// -----------------------------------------------------------------------
// Coordinate system: viewBox "0 0 120 72".
// Units: abstract SVG user units, 1:1 with the rendered pixel size when
// width === 120 (otherwise uniformly scaled by the browser).
// Why 120x72: the gauge is a half circle of radius 50 centered at
// (60, 62). 62 (rather than 60) and a 72-tall viewBox leave ~10px of
// padding below center and above the arc so a thick stroke (confidence
// can push stroke-width up to 14) never clips the top or bottom edge.
// -----------------------------------------------------------------------

interface BeliefGaugeProps {
  value: number; // 0-1 belief/probability
  confidence: number; // 0-1, mapped to stroke thickness
  label: string;
  size?: number;
}

const CX = 60;
const CY = 62;
const R = 50;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Arc from startAngle to endAngle, both in degrees on the standard SVG
// angle convention (0deg = +x axis/right, 180deg = -x axis/left), swept
// clockwise through the top (90deg). Used both for the dim background
// track (180 -> 0) and the value fill (180 -> 180 - value*180).
function describeArc(startAngle: number, endAngle: number) {
  const start = polarToCartesian(CX, CY, R, startAngle);
  const end = polarToCartesian(CX, CY, R, endAngle);
  const largeArcFlag = Math.abs(startAngle - endAngle) <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export default function BeliefGauge({ value, confidence, label, size = 120 }: BeliefGaugeProps) {
  const v = Math.max(0, Math.min(1, value));
  const c = Math.max(0, Math.min(1, confidence));

  const color = v > 0.6 ? "var(--sev-5)" : v > 0.3 ? "var(--sev-4)" : "var(--good)";
  // stroke thickness 4 (low confidence, "fuzzy" estimate) to 14 (high confidence)
  const strokeWidth = 4 + c * 10;

  const bgPath = describeArc(180, 0);
  const valuePath = v > 0.004 ? describeArc(180, 180 - v * 180) : "";

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        viewBox="0 0 120 72"
        width={size}
        height={(size * 72) / 120}
        role="img"
        aria-label={`${label}: ${Math.round(v * 100)} percent, confidence ${Math.round(c * 100)} percent`}
      >
        <path d={bgPath} fill="none" stroke="var(--border-strong)" strokeWidth={6} strokeLinecap="round" />
        {valuePath && (
          <path d={valuePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="16"
          fill="var(--text-primary)"
        >
          {Math.round(v * 100)}%
        </text>
      </svg>
      <div className="mt-1 text-center font-mono text-[9px] tracking-wider text-slate-400">
        {label.toUpperCase()}
      </div>
    </div>
  );
}
