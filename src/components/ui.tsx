import type { ReactNode } from "react";

export function Card({ title, subtitle, children, className = "" }: { title?: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm ${className}`}>
      {title && <h2 className="text-sm font-semibold text-white">{title}</h2>}
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      <div className={title || subtitle ? "mt-4" : ""}>{children}</div>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{children}</div>;
}

export function Stat({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "rose" | "emerald" | "amber" | "sky" }) {
  const toneClass: Record<string, string> = {
    slate: "text-slate-100",
    rose: "text-rose-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    sky: "text-sky-400",
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className={`mt-1 text-2xl font-semibold ${toneClass[tone]}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "emerald" | "amber" | "sky" }) {
  const toneClass: Record<string, string> = {
    slate: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${toneClass[tone]}`}>{children}</span>;
}

export function Bar({ value, max, tone = "sky" }: { value: number; max: number; tone?: "sky" | "rose" | "emerald" | "amber" }) {
  const toneClass: Record<string, string> = {
    sky: "bg-sky-500",
    rose: "bg-rose-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
  };
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${toneClass[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Button({ children, onClick, variant = "default", disabled }: { children: ReactNode; onClick?: () => void; variant?: "default" | "primary" | "danger"; disabled?: boolean }) {
  const variantClass: Record<string, string> = {
    default: "bg-slate-800 text-slate-200 hover:bg-slate-700 ring-1 ring-inset ring-slate-700",
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    danger: "bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 ring-1 ring-inset ring-rose-600/40",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${variantClass[variant]}`}
    >
      {children}
    </button>
  );
}
