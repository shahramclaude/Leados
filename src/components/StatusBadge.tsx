const COLORS: Record<string, string> = {
  draft: "bg-slate-200 text-slate-700",
  confirmed: "bg-blue-100 text-blue-800",
  active: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  breached: "bg-rose-200 text-rose-900",
  completed: "bg-slate-200 text-slate-600",
  lint_failed: "bg-rose-100 text-rose-800",
  ready: "bg-emerald-100 text-emerald-800",
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-rose-200 text-rose-900",
  clean: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-200 text-slate-700",
  quarantined: "bg-rose-200 text-rose-900",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = COLORS[status] ?? "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
