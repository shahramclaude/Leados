"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/AppContext";
import { DOMAIN_META, severityColor, timeAgo } from "@/lib/domains";
import type { NotificationItem } from "@/lib/types";

export default function NotificationDrawer() {
  const { notificationDrawerOpen, setNotificationDrawerOpen, lastUpdated } = useApp();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notificationDrawerOpen) return;
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data: { notifications: NotificationItem[] }) => setNotifications(data.notifications))
      .finally(() => setLoading(false));
  }, [notificationDrawerOpen, lastUpdated]);

  if (!notificationDrawerOpen) return null;

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const grouped = new Map<string, NotificationItem[]>();
  for (const n of notifications) {
    const list = grouped.get(n.domain) ?? [];
    list.push(n);
    grouped.set(n.domain, list);
  }

  return (
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 bg-black/50" onClick={() => setNotificationDrawerOpen(false)} />
      <div className="leados-slide-in absolute right-0 top-0 h-full w-full border-l border-slate-700 bg-[#0d1016] shadow-2xl sm:w-[360px]">
        <div className="flex h-10 items-center justify-between border-b border-slate-800 px-3">
          <span className="font-mono text-xs tracking-widest text-slate-300">NOTIFICATIONS</span>
          <div className="flex items-center gap-3">
            <button onClick={markAllRead} className="font-mono text-[10px] text-indigo-400 hover:text-indigo-300">
              MARK ALL READ
            </button>
            <button
              onClick={() => setNotificationDrawerOpen(false)}
              className="flex h-8 w-8 items-center justify-center text-slate-400 hover:text-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="h-[calc(100%-2.5rem)] overflow-y-auto">
          {loading && <div className="p-4 font-mono text-xs text-slate-500">LOADING…</div>}
          {!loading && notifications.length === 0 && (
            <div className="p-6 text-center font-mono text-xs text-slate-500">NO NOTIFICATIONS</div>
          )}
          {Array.from(grouped.entries()).map(([domain, items]) => (
            <div key={domain}>
              <div className="sticky top-0 bg-[#0d1016] px-3 py-1.5 font-mono text-[9px] tracking-widest text-slate-500">
                {DOMAIN_META[domain as keyof typeof DOMAIN_META]?.label.toUpperCase() ?? domain.toUpperCase()}
              </div>
              {items.map((n) => {
                const expanded = expandedId === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setExpandedId(expanded ? null : n.id)}
                    className="block w-full border-b border-slate-800/70 px-3 py-2.5 text-left"
                    style={{
                      borderLeft: n.read ? "2px solid transparent" : `2px solid ${severityColor(n.severity)}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold text-black"
                        style={{ backgroundColor: severityColor(n.severity) }}
                      >
                        SEV {n.severity}
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: DOMAIN_META[domain as keyof typeof DOMAIN_META]?.color }}
                      />
                      <span className="flex-1 truncate text-sm text-slate-100">{n.title}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className={`text-xs text-slate-400 ${expanded ? "" : "truncate"}`}>{n.message}</p>
                      <span className="shrink-0 font-mono text-[9px] text-slate-500">{timeAgo(n.createdAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
