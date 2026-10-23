import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold text-slate-950">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "indigo" | "amber" | "rose" | "emerald";
}) {
  const toneClasses: Record<string, string> = {
    slate: "text-slate-950",
    indigo: "text-indigo-600",
    amber: "text-amber-600",
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold ${toneClasses[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

const BADGE_TONES: Record<string, string> = {
  proposed: "bg-slate-100 text-slate-700",
  under_review: "bg-amber-100 text-amber-800",
  committed: "bg-indigo-100 text-indigo-700",
  implemented: "bg-emerald-100 text-emerald-700",
  reversed: "bg-rose-100 text-rose-700",
  new: "bg-indigo-100 text-indigo-700",
  investigating: "bg-amber-100 text-amber-800",
  resolved: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-slate-100 text-slate-500",
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-100 text-rose-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-slate-100 text-slate-500",
  draft: "bg-slate-100 text-slate-600",
  circulated: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  open: "bg-rose-100 text-rose-700",
  mitigating: "bg-amber-100 text-amber-800",
  closed: "bg-emerald-100 text-emerald-700",
  planned: "bg-slate-100 text-slate-600",
  at_risk: "bg-rose-100 text-rose-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export function Badge({ value }: { value: string }) {
  const tone = BADGE_TONES[value] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
