// LEADOS — Part 56: small presentational badge helpers shared by the
// Accountability Console, Impact Assessment Studio, My Automated Decisions
// and Conformity Export screens.
import type { ReactNode } from "react";

function Pill({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function RegulatoryTierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    minimal: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    limited: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    high: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    unacceptable: "bg-black text-white",
  };
  return <Pill className={styles[tier] ?? "bg-slate-100 text-slate-700"}>{tier}</Pill>;
}

export function ActionTierBadge({ tier }: { tier: string }) {
  return <Pill className="bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300">{tier}</Pill>;
}

export function DecisionRoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    inform: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200",
    recommend: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200",
    automate: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  };
  return <Pill className={styles[role] ?? "bg-slate-100 text-slate-700"}>{role}</Pill>;
}

export function StatusBadge({ status }: { status: "pass" | "warn" | "fail" | "unknown" | string }) {
  const styles: Record<string, string> = {
    pass: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    warn: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    fail: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
    unknown: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200",
  };
  return <Pill className={styles[status] ?? styles.unknown}>{status}</Pill>;
}

export function AssessmentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300",
    in_review: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    approved: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    superseded: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 line-through",
    missing: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  };
  return <Pill className={styles[status] ?? "bg-slate-100 text-slate-700"}>{status.replace("_", " ")}</Pill>;
}

export function ContestationStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    under_review: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
    upheld: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    overturned: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
    dismissed: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200",
  };
  return <Pill className={styles[status] ?? "bg-slate-100 text-slate-700"}>{status.replace("_", " ")}</Pill>;
}
