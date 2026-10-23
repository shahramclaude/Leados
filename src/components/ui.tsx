import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  // decision status
  proposed: "bg-slate-700 text-slate-200",
  under_review: "bg-amber-500/20 text-amber-300",
  committed: "bg-emerald-500/20 text-emerald-300",
  reversed: "bg-rose-500/20 text-rose-300",
  // impact / severity
  low: "bg-sky-500/20 text-sky-300",
  medium: "bg-amber-500/20 text-amber-300",
  high: "bg-orange-500/20 text-orange-300",
  critical: "bg-rose-500/20 text-rose-300",
  // signal status
  new: "bg-indigo-500/20 text-indigo-300",
  investigating: "bg-amber-500/20 text-amber-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  dismissed: "bg-slate-700 text-slate-300",
  // cadence status
  scheduled: "bg-indigo-500/20 text-indigo-300",
  completed: "bg-emerald-500/20 text-emerald-300",
  skipped: "bg-slate-700 text-slate-300",
  // agent run status
  queued: "bg-slate-700 text-slate-200",
  running: "bg-amber-500/20 text-amber-300",
  succeeded: "bg-emerald-500/20 text-emerald-300",
  failed: "bg-rose-500/20 text-rose-300",
};

export function Badge({ label }: { label: string }) {
  const color = badgeColors[label] ?? "bg-slate-700 text-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${color}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function fmtDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
