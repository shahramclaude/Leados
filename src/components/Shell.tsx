import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export type Route = "today" | "roster" | "workspace" | "risk" | "health" | "data" | "about";

const NAV: { id: Route; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "roster", label: "Roster" },
  { id: "workspace", label: "Workspace" },
  { id: "risk", label: "Risk Register" },
  { id: "health", label: "Health" },
  { id: "data", label: "Data" },
  { id: "about", label: "Provenance" },
];

export function Shell({ route, onNavigate, children }: { route: Route; onNavigate: (r: Route) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-stone-200 bg-white p-4 sm:block">
          <div className="mb-6 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-sm font-bold text-white">L</div>
            <div>
              <div className="text-sm font-semibold leading-tight">LeadOS Sandbox</div>
              <div className="text-[11px] leading-tight text-stone-400">original build</div>
            </div>
          </div>
          <nav className="space-y-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate(n.id)}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  route === n.id ? "bg-rose-600 text-white" : "text-stone-600 hover:bg-stone-100"
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 sm:hidden">
            <div className="text-sm font-semibold">LeadOS Sandbox</div>
            <select
              value={route}
              onChange={(e) => onNavigate(e.target.value as Route)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
            >
              {NAV.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </header>
          <main className="min-w-0 flex-1 p-4 sm:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-stone-200 bg-white p-4 shadow-sm", className)}>
      {title && <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h3>}
      {children}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
  const styles: Record<string, string> = {
    low: "bg-stone-100 text-stone-600",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-rose-100 text-rose-700",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", styles[severity])}>{severity}</span>;
}

export function BucketBadge({ bucket }: { bucket: "clear" | "moderate" | "elevated" | "critical" }) {
  const styles: Record<string, string> = {
    clear: "bg-emerald-100 text-emerald-700",
    moderate: "bg-amber-100 text-amber-700",
    elevated: "bg-orange-100 text-orange-700",
    critical: "bg-rose-100 text-rose-700",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", styles[bucket])}>{bucket}</span>;
}

export function Button({
  children,
  onClick,
  variant = "default",
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  className?: string;
}) {
  const styles: Record<string, string> = {
    default: "bg-stone-100 text-stone-700 hover:bg-stone-200",
    primary: "bg-rose-600 text-white hover:bg-rose-700",
    danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200",
  };
  return (
    <button onClick={onClick} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", styles[variant], className)}>
      {children}
    </button>
  );
}
