import type { ReactNode } from "react";

export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {title && <h2 className="text-lg font-semibold text-slate-900">{title}</h2>}
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      <div className={title ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

const STATUS_STYLES: Record<string, string> = {
  matched: "bg-emerald-100 text-emerald-800",
  explained: "bg-amber-100 text-amber-800",
  exception: "bg-rose-100 text-rose-800",
  "signed-off": "bg-emerald-100 text-emerald-800",
  "in-progress": "bg-sky-100 text-sky-800",
  pending: "bg-slate-100 text-slate-700",
  blocked: "bg-rose-100 text-rose-800",
  review: "bg-amber-100 text-amber-800",
  "on-track": "bg-emerald-100 text-emerald-800",
  alert: "bg-amber-100 text-amber-800",
  overdue: "bg-rose-100 text-rose-800",
  decided: "bg-slate-200 text-slate-700",
  "three-way-matched": "bg-emerald-100 text-emerald-800",
  "two-way-matched": "bg-sky-100 text-sky-800",
  "no-po": "bg-slate-100 text-slate-700",
  open: "bg-sky-100 text-sky-800",
  resolved: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  healthy: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  breach: "bg-rose-100 text-rose-800",
  closed: "bg-emerald-100 text-emerald-800",
  "rejected-root-cause": "bg-rose-100 text-rose-800",
  true: "bg-rose-100 text-rose-800",
  false: "bg-slate-100 text-slate-600",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {label ?? status}
    </span>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-slate-100 px-3 py-2 text-sm text-slate-700 ${className ?? ""}`}>{children}</td>;
}

export function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
    >
      {children}
    </button>
  );
}
