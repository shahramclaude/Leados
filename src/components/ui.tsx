import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("rounded-xl border p-5", className)}
      style={{
        background: "linear-gradient(180deg, rgba(16,20,28,.92), rgba(13,17,24,.92))",
        borderColor: "var(--line)",
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  glyph,
  desc,
  spin,
}: {
  eyebrow?: string;
  title: string;
  glyph?: string;
  desc?: string;
  spin?: boolean;
}) {
  return (
    <div className="mb-4">
      {eyebrow && (
        <div className="font-mono-ui text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>
          {eyebrow}
        </div>
      )}
      <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
        {title}
        {glyph && (
          <span className={cn("inline-block text-xl", spin && "animate-spin-slow")} style={{ color: "var(--accent)" }} aria-hidden>
            {glyph}
          </span>
        )}
      </h2>
      {desc && (
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--text-muted)" }}>
          {desc}
        </p>
      )}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  red: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  slate: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-500/30",
  indigo: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",
};

export function Badge({ color = "slate", children, className }: { color?: keyof typeof badgeColors; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium font-mono-ui", badgeColors[color], className)}>
      {children}
    </span>
  );
}

/** Confidence pill — ALWAYS shown next to any physics output. Text passed in verbatim. */
export function ConfidencePill({ level }: { level: "high" | "med" | "low" | "HIGH" | "MED" | "LOW" | "low" | string }) {
  const L = level.toString().toLowerCase();
  const color = L === "high" ? "green" : L === "med" || L === "medium" ? "amber" : "red";
  const text = L === "high" ? "HIGH CONFIDENCE" : L === "med" || L === "medium" ? "MED CONFIDENCE" : "LOW CONFIDENCE";
  return <Badge color={color as any}>◆ {text}</Badge>;
}

export function Labeled({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span aria-hidden>🏷️</span>
      <span>{text}</span>
    </p>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold font-mono-ui" style={{ color: "var(--text)" }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function directionBadge(direction: "WORSENING" | "IMPROVING" | "STABLE") {
  if (direction === "WORSENING") return <Badge color="red">▲ WORSENING</Badge>;
  if (direction === "IMPROVING") return <Badge color="green">▼ IMPROVING</Badge>;
  return <Badge color="slate">● STABLE</Badge>;
}

export function scoreBandLabel(score: number) {
  if (score < 3) return { text: "LOW", color: "green" as const };
  if (score < 6) return { text: "MEDIUM", color: "amber" as const };
  if (score < 8) return { text: "HIGH", color: "red" as const };
  return { text: "CRITICAL", color: "red" as const };
}

export function scoreColor(score: number): string {
  if (score < 3) return "var(--ok)";
  if (score < 6) return "var(--warn)";
  return "var(--bad)";
}
