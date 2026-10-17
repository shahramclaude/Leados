import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>}
      {children}
    </div>
  );
}

export function Badge({ kind, children }: { kind: "verified" | "contradicted" | "original" | "disclosure"; children: ReactNode }) {
  const styles: Record<string, string> = {
    verified: "bg-emerald-50 border-emerald-200 text-emerald-800",
    contradicted: "bg-red-50 border-red-200 text-red-800",
    original: "bg-blue-50 border-blue-200 text-blue-800",
    disclosure: "bg-amber-50 border-amber-200 text-amber-800",
  };
  return (
    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium", styles[kind])}>
      {children}
    </span>
  );
}
