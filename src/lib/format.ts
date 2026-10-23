export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  under_review: "Under Review",
  committed: "Committed",
  archived: "Archived",
  active: "Active",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export const BADGE_CLASSES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
  medium: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  high: "bg-orange-100 text-orange-800 ring-1 ring-orange-300",
  critical: "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
  proposed: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
  under_review: "bg-blue-100 text-blue-800 ring-1 ring-blue-300",
  committed: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  archived: "bg-slate-200 text-slate-600 ring-1 ring-slate-300",
  active: "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
  acknowledged: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  resolved: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
};
