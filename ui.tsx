import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ eyebrow, title, desc }: { eyebrow?: string; title: string; desc?: string }) {
  return (
    <div className="mb-4">
      {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</div>}
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  red: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
  amber: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  green: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  slate: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  indigo: "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200",
};

export function Badge({ color = "slate", children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeColors[color])}>{children}</span>;
}

export function Labeled({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
      <span aria-hidden>🏷️</span>
      <span>{text}</span>
    </p>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
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
