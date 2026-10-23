import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const severityStyles: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  high: "bg-orange-500/10 text-orange-300 ring-orange-500/30",
  critical: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  open: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  proposed: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  under_review: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  committed: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  closed: "bg-slate-600/10 text-slate-400 ring-slate-600/30",
  triaged: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  resolved: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  dismissed: "bg-slate-600/10 text-slate-400 ring-slate-600/30",
  mitigating: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  monitoring: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  idle: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  running: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  paused: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  error: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  queued: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  succeeded: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  failed: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  active: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  retired: "bg-slate-600/10 text-slate-400 ring-slate-600/30",
  draft: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  in_review: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  approved: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  published: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  piloting: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  scaling: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  adopted: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  improving: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  stable: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  declining: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  supervised: "bg-slate-500/10 text-slate-300 ring-slate-500/30",
  semi_autonomous: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  autonomous: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
};

export function Badge({ value }: { value: string }) {
  const style = severityStyles[value] ?? "bg-slate-500/10 text-slate-300 ring-slate-500/30";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${style}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500 ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-500 ${props.className ?? ""}`}
    />
  );
}

export function Select({
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 ${className}`}
    >
      {children}
    </select>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
