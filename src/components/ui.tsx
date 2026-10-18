import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/10 text-slate-200 border-white/10",
    good: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    bad: "bg-rose-500/10 text-rose-300 border-rose-500/30",
    info: "bg-indigo-500/10 text-indigo-300 border-indigo-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "info",
}: {
  value: number; // 0..100
  tone?: "good" | "warn" | "bad" | "info";
}) {
  const colors: Record<string, string> = {
    good: "from-emerald-400 to-emerald-500",
    warn: "from-amber-400 to-amber-500",
    bad: "from-rose-400 to-rose-500",
    info: "from-indigo-400 to-violet-500",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", colors[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-indigo-400/40 bg-indigo-500/10"
          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
      )}
    >
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", checked ? "text-indigo-200" : "text-slate-300")}>
          {label}
        </span>
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-indigo-500" : "bg-white/15"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}
