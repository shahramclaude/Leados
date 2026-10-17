import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-zinc-100">{children}</h2>
      {sub && <p className="mt-1 text-sm text-zinc-400">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "red" | "amber" | "emerald" | "sky" | "violet" }) {
  const tones: Record<string, string> = {
    zinc: "bg-zinc-800 text-zinc-300 border-zinc-700",
    red: "bg-red-950 text-red-300 border-red-800",
    amber: "bg-amber-950 text-amber-300 border-amber-800",
    emerald: "bg-emerald-950 text-emerald-300 border-emerald-800",
    sky: "bg-sky-950 text-sky-300 border-sky-800",
    violet: "bg-violet-950 text-violet-300 border-violet-800",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function SevBadge({ sev }: { sev: number }) {
  const tone = sev >= 5 ? "red" : sev >= 4 ? "amber" : sev >= 3 ? "sky" : "zinc";
  return <Badge tone={tone as any}>sev {sev}</Badge>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-violet-600 hover:bg-violet-500 text-white border-transparent",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-300 border-transparent",
    danger: "bg-red-900 hover:bg-red-800 text-red-100 border-red-800",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">{children}</label>;
}

export function DisclosureNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
      <span className="mr-1 font-semibold uppercase tracking-wide">Labeled:</span>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</div>;
}
