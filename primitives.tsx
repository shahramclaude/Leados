import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-slate-900">{children}</h2>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

const sevColors: Record<number, string> = {
  5: "bg-red-100 text-red-800 border-red-200",
  4: "bg-orange-100 text-orange-800 border-orange-200",
  3: "bg-amber-100 text-amber-800 border-amber-200",
  2: "bg-sky-100 text-sky-800 border-sky-200",
  1: "bg-slate-100 text-slate-700 border-slate-200",
};

export function SevBadge({ sev }: { sev: number }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", sevColors[sev] || sevColors[1])}>
      sev {sev}
    </span>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "violet" | "green" | "red" | "amber" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    violet: "bg-violet-100 text-violet-700 border-violet-200",
    green: "bg-emerald-100 text-emerald-700 border-emerald-200",
    red: "bg-red-100 text-red-700 border-red-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = "default",
  className,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const variants: Record<string, string> = {
    default: "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
    primary: "bg-violet-600 text-white hover:bg-violet-700 border border-violet-600",
    danger: "bg-red-600 text-white hover:bg-red-700 border border-red-600",
    ghost: "bg-transparent border border-transparent text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <pre className={cn("whitespace-pre-wrap rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 overflow-x-auto", className)}>{children}</pre>;
}

export function KeyCap({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{children}</kbd>;
}
