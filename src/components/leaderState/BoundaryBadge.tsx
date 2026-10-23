// src/components/leaderState/BoundaryBadge.tsx
//
// Explicit data-boundary statement required on every "My State" surface.

import Link from "next/link";

export function BoundaryBadge({ label = "Only you can see this" }: { label?: string }) {
  return (
    <Link
      href="/my-state/access-model"
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 no-underline transition hover:border-slate-400 hover:bg-slate-50"
    >
      <span aria-hidden="true">🔒</span>
      {label}
      <span className="text-slate-400">— here&apos;s the proof</span>
    </Link>
  );
}
