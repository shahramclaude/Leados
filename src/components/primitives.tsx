import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import type { Severity } from "../lib/types";
import { SEVERITY_VAR } from "../lib/shared";

// ─────────────────────────────────────────────────────────────
// primitives.tsx — small reusable visual atoms shared by every
// view. Kept dependency-free (no business logic).
// ─────────────────────────────────────────────────────────────

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-card)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Dot({ colorVar, size = 8, className }: { colorVar: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ width: size, height: size, backgroundColor: `var(${colorVar})` }}
    />
  );
}

export function LiveDot({ ok = true, size = 6 }: { ok?: boolean; size?: number }) {
  return (
    <span
      className="live-dot inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: ok ? "var(--health-green)" : "var(--health-critical)",
      }}
    />
  );
}

const SEV_LABEL_BG: Record<Severity, string> = {
  5: "bg-red-950 text-red-400 border-red-800",
  4: "bg-amber-950 text-amber-400 border-amber-800",
  3: "bg-yellow-950 text-yellow-500 border-yellow-900",
  2: "bg-slate-800/60 text-slate-400 border-slate-700",
  1: "bg-slate-900 text-slate-500 border-slate-800",
};

export function SevBadge({ sev }: { sev: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide",
        SEV_LABEL_BG[sev]
      )}
    >
      SEV {sev}
    </span>
  );
}

export function DomainBadge({ name, colorVar }: { name: string; colorVar: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={{
        color: `var(${colorVar})`,
        borderColor: `color-mix(in srgb, var(${colorVar}) 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, var(${colorVar}) 10%, transparent)`,
      }}
    >
      <Dot colorVar={colorVar} size={6} />
      {name}
    </span>
  );
}

export function Meter({
  value,
  max = 100,
  color,
  height = 4,
}: {
  value: number;
  max?: number;
  color: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-[color:var(--bg-elevated)]"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function GlyphSpin({ color = "var(--text-accent)", size = 16 }: { color?: string; size?: number }) {
  return (
    <span
      className="physics-spin inline-flex items-center justify-center font-mono"
      style={{ color, fontSize: size, lineHeight: 1 }}
      aria-hidden
    >
      ⚛
    </span>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full z-[60] mt-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] px-2 py-1 font-mono text-[10px] text-[color:var(--text-secondary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function sevColorVar(sev: Severity): string {
  return SEVERITY_VAR[sev];
}
