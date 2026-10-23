import type { ReactNode } from "react";
import { cn } from "../utils/cn";
import type { EvidenceClass } from "../types";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const evidenceStyles: Record<EvidenceClass, string> = {
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  simulated: "bg-amber-50 text-amber-700 border-amber-200",
  planned: "bg-slate-100 text-slate-600 border-slate-200",
};

const evidenceLabel: Record<EvidenceClass, string> = {
  verified: "Verified",
  simulated: "Simulated",
  planned: "Planned / not built",
};

export function EvidenceTag({ level }: { level: EvidenceClass }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        evidenceStyles[level]
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          level === "verified" && "bg-emerald-500",
          level === "simulated" && "bg-amber-500",
          level === "planned" && "bg-slate-400"
        )}
      />
      {evidenceLabel[level]}
    </span>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "emerald" | "rose" | "amber" | "indigo";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-800",
    indigo: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = "indigo" }: { value: number; max?: number; tone?: "indigo" | "rose" | "emerald" | "amber" }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const tones: Record<string, string> = {
    indigo: "bg-indigo-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full transition-all", tones[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </Card>
  );
}
