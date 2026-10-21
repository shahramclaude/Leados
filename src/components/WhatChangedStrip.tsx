"use client";

// ---------------------------------------------------------------------------
// "What changed since your last visit" — compares a localStorage timestamp
// against the audit log. Shown once per route per session, dismissible.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import type { AuditEntryDTO } from "@/lib/state/entityStore";

const STORAGE_KEY = "leados.lastVisit";

export function WhatChangedStrip() {
  const [entries, setEntries] = useState<AuditEntryDTO[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const lastVisit = window.localStorage.getItem(STORAGE_KEY);
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    if (!lastVisit) return;

    const controller = new AbortController();
    fetch(`/api/audit?since=${encodeURIComponent(lastVisit)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((payload: { items: AuditEntryDTO[] }) => {
        if (payload.items.length > 0) setEntries(payload.items);
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  if (!entries || entries.length === 0 || dismissed) return null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <div>
        <p className="font-medium">
          {entries.length} change{entries.length === 1 ? "" : "s"} since your last visit
        </p>
        <ul className="mt-1 list-inside list-disc text-indigo-800">
          {entries.slice(0, 3).map((e) => (
            <li key={e.id}>{e.summary}</li>
          ))}
        </ul>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Dismiss
      </button>
    </div>
  );
}
