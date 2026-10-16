import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-slate-900">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

const SEV_COLORS: Record<number, string> = {
  1: "bg-slate-100 text-slate-600 border-slate-300",
  2: "bg-amber-50 text-amber-700 border-amber-300",
  3: "bg-orange-50 text-orange-700 border-orange-300",
  4: "bg-rose-50 text-rose-700 border-rose-300",
};

export function SevBadge({ sev }: { sev: number }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", SEV_COLORS[sev] || SEV_COLORS[1])}>
      sev-{sev}
    </span>
  );
}

export function ConfBadge({ conf }: { conf: string }) {
  const dot = conf === "high" ? "bg-emerald-500" : conf === "medium" ? "bg-amber-500" : "bg-slate-400";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {conf}
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "violet" | "emerald" | "amber" }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", map[tone])}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<string, string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(base, styles[variant], className)}>
      {children}
    </button>
  );
}
