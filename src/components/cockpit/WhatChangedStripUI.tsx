import { useState } from "react";
import type { AuditEntry } from "../../lib/domainData";
import { formatRelativeTime } from "../../lib/format";

/** UI mirror of the real repo's `src/components/WhatChangedStrip.tsx`
 * (localStorage "since last visit" diff, dismissible, max 3 shown). Here it
 * is fed by `diffSinceLastVisit` (see `lib/whatChanged.ts`) instead of a
 * `/api/audit` fetch, same mechanism. */
export function WhatChangedStripUI({ entries, asOf }: { entries: AuditEntry[]; asOf: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (entries.length === 0 || dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <div>
        <p className="font-medium">
          {entries.length} change{entries.length === 1 ? "" : "s"} since your last visit
        </p>
        <ul className="mt-1 list-inside list-disc text-indigo-800">
          {entries.slice(0, 3).map((e) => (
            <li key={e.id}>
              {e.summary} <span className="text-indigo-500">· {formatRelativeTime(e.occurredAt, new Date(asOf))}</span>
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        Dismiss
      </button>
    </div>
  );
}
