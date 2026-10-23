// Client-safe types, labels, and badge styles. This file must NOT import the
// db client (pg) so it can be bundled into client components safely.

export type VerifiedStatus = "unverified" | "present" | "partial" | "missing" | "legacy_quarantined";
export type SeedStatus = "canonical" | "partial" | "absent";

export const VERIFIED_STATUS_LABELS: Record<VerifiedStatus, string> = {
  unverified: "Unverified (seed only)",
  present: "Present (verified)",
  partial: "Partial (verified)",
  missing: "Missing (verified)",
  legacy_quarantined: "Legacy-quarantined (verified)",
};

export const SEED_STATUS_LABELS: Record<SeedStatus, string> = {
  canonical: "✅ canonical",
  partial: "🟡 partial",
  absent: "🔴 absent",
};

export const SEED_STATUS_BADGE: Record<SeedStatus, string> = {
  canonical: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  partial: "bg-amber-100 text-amber-800 ring-amber-600/20",
  absent: "bg-rose-100 text-rose-800 ring-rose-600/20",
};

export const VERIFIED_STATUS_BADGE: Record<VerifiedStatus, string> = {
  unverified: "bg-slate-100 text-slate-600 ring-slate-500/20",
  present: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  partial: "bg-amber-100 text-amber-800 ring-amber-600/20",
  missing: "bg-rose-100 text-rose-800 ring-rose-600/20",
  legacy_quarantined: "bg-violet-100 text-violet-800 ring-violet-600/20",
};
