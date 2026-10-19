import type { HealthStatus, Severity } from "@/lib/types";

export function SevBadge({ sev }: { sev: Severity | number }) {
  const color =
    sev >= 5 ? "bg-red-600/20 text-red-400 border-red-700" : sev >= 4 ? "bg-amber-600/20 text-amber-400 border-amber-700" : "bg-slate-700/40 text-slate-300 border-slate-700";
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-mono ${color}`}>sev {sev}</span>;
}

export function StatusPill({ status }: { status: HealthStatus }) {
  const color =
    status === "healthy"
      ? "bg-emerald-600/20 text-emerald-400 border-emerald-700"
      : status === "at_risk"
        ? "bg-amber-600/20 text-amber-400 border-amber-700"
        : "bg-red-600/20 text-red-400 border-red-700";
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${color}`}>{status.replace("_", " ")}</span>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 ${className}`}>{children}</div>;
}

export function ViewHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export function LoadingPanel() {
  return (
    <Card className="text-sm text-slate-500">
      {"Loading orchestrator data\u2026"}
    </Card>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return <Card className="border-red-800 text-sm text-red-400">{message}</Card>;
}

export function EmptyPanel({ message }: { message: string }) {
  return <Card className="text-sm text-slate-500">{message}</Card>;
}
