import type { ReactNode } from "react";

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-slate-500">{children}</p>;
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "indigo" | "blue" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-700",
    indigo: "bg-indigo-100 text-indigo-700",
    blue: "bg-sky-100 text-sky-700",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "PASSING" || status === "MANAGED" || status === "STABLE" || status === "HIGH_PERFORMANCE"
    ? "green"
    : status === "WATCH" || status === "ELEVATED"
    ? "amber"
    : "red";
  return <Badge tone={tone as any}>{status}</Badge>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function SevBadge({ sev }: { sev: number }) {
  const tone = sev >= 4 ? "red" : sev === 3 ? "amber" : "slate";
  return <Badge tone={tone as any}>sev {sev}</Badge>;
}

export function Bar({ pct, tone = "indigo" }: { pct: number; tone?: "indigo" | "green" | "amber" | "red" }) {
  const colors: Record<string, string> = { indigo: "bg-indigo-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500" };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full ${colors[tone]} transition-all`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
