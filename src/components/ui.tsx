import type { ReactNode } from "react";

export function Card({ title, subtitle, children, right }: { title?: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm">
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function DisclosureTag({ kind }: { kind: "real" | "heuristic" | "gap" }) {
  const styles = {
    real: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
    heuristic: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
    gap: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  }[kind];
  const text = { real: "Verified / real", heuristic: "Heuristic · disclosed", gap: "Not implemented" }[kind];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${styles}`}>{text}</span>;
}

export function Bar({ value, max = 1, color = "from-amber-400 to-rose-500" }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{children}</code>;
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-slate-500">{children}</p>;
}
