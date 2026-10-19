"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { domainHref } from "@/lib/nav";
import type { NotificationSummary } from "@/lib/types";

interface EventsResponse {
  notifications: NotificationSummary[];
}

export default function NotificationTray({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useAppContext();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/events", { cache: "no-store" })
      .then((res) => res.json() as Promise<EventsResponse>)
      .then((data) => {
        if (!cancelled) setNotifications(data.notifications);
      })
      .catch(() => {
        /* tray simply shows empty state on failure */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const grouped = notifications.reduce<Record<string, NotificationSummary[]>>((acc, n) => {
    const bucket = acc[n.domain] ?? [];
    bucket.push(n);
    acc[n.domain] = bucket;
    return acc;
  }, {});

  async function markAllRead() {
    setMarking(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      await refresh();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-slate-800 bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">Notifications</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={marking || notifications.every((n) => n.read)}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
          >
            Mark all read
          </button>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close">
            {"\u2715"}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="px-4 py-3 text-sm text-slate-500">{"Loading\u2026"}</p>}
        {!loading && notifications.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">No notifications.</p>}
        {Object.entries(grouped).map(([domain, items]) => (
          <div key={domain} className="border-b border-slate-800/60">
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{domain}</p>
            {items.map((n) => (
              <a
                key={n.id}
                href={domainHref(n.domain)}
                className={`block px-4 py-2 text-sm hover:bg-slate-800 ${n.read ? "text-slate-500" : "text-slate-100"}`}
              >
                <span className="block">{n.title}</span>
                <span className="block text-xs text-slate-500">{n.message}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
