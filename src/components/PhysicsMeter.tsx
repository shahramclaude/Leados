import type { ReactNode } from "react";
import { Meter } from "./primitives";

// ─────────────────────────────────────────────────────────────
// PhysicsMeter — the small numeric bar used throughout the intel
// rail's physics dashboard. Each meter always pairs a raw number
// with a colored fill so urgency is legible without reading text.
// ─────────────────────────────────────────────────────────────
export function PhysicsMeter({
  glyph,
  label,
  value,
  display,
  max = 100,
  color,
}: {
  glyph: string;
  label: string;
  value: number;
  display?: string;
  max?: number;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span style={{ color }}>{glyph}</span>
          {label}
        </span>
        <span className="font-mono text-[11px] font-semibold text-[color:var(--text-code)]">
          {display ?? value}
        </span>
      </div>
      <Meter value={value} max={max} color={color} />
    </div>
  );
}

/** Non-numeric physics row (velocity / resonance text readouts). */
export function PhysicsTextRow({ glyph, label, children, color }: { glyph: string; label: string; children: ReactNode; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-[color:var(--text-muted)]">
        <span style={{ color }}>{glyph}</span>
        {label}
      </div>
      <div className="font-mono text-[11px] text-[color:var(--text-secondary)]">{children}</div>
    </div>
  );
}

/** Full labeled physics-law card used in the "Physics Breakdown" expansion. */
export function PhysicsLawCard({
  glyph,
  name,
  color,
  children,
}: {
  glyph: string;
  name: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--bg-card)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold" style={{ color }}>
          <span className="physics-spin inline-block">{glyph}</span>
          {name}
        </div>
        <span className="font-mono text-[8px] uppercase tracking-wide text-[color:var(--text-muted)]">
          heuristic · low confidence
        </span>
      </div>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}
