"use client";

// Slide-over notification list. Implements a minimal windowed/virtualized
// list (fixed row height, render only the visible slice + overscan) so the
// DOM node count stays flat regardless of history size — required by the
// performance budget ("virtualize notification lists").

import { useMemo, useRef, useState } from "react";
import { useNotificationStoreState } from "@/hooks/useNotificationStoreState";
import { patchNotificationStatus, type StoreNotification } from "@/lib/store/notificationStore";
import { useNowTick, formatRelativeTime } from "@/hooks/useNowTick";

const ROW_HEIGHT = 112;
const VIEWPORT_HEIGHT = 480;
const OVERSCAN = 4;

const SEVERITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Minor",
  3: "Moderate",
  4: "High",
  5: "Critical",
};

const DELIVERY_LABEL: Record<string, string> = {
  interrupt: "Interrupted you",
  digest: "Batched to digest",
  suppressed: "Suppressed",
  in_app: "In-app",
};

async function patchNotification(id: string, body: Record<string, unknown>) {
  await fetch(`/api/notifications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function NotificationDrawer({ onClose }: { onClose: () => void }) {
  const { byId, order, unreadCount } = useNotificationStoreState();
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("unread");
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const now = useNowTick(15_000);

  const items = useMemo(() => {
    const all = order.map((id) => byId[id]).filter(Boolean) as StoreNotification[];
    if (filter === "unread") return all.filter((n) => n.status === "unread");
    if (filter === "archived") return all.filter((n) => n.status === "archived");
    return all;
  }, [byId, order, filter]);

  const totalHeight = items.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);
  const visibleItems = items.slice(startIndex, endIndex);

  const markRead = async (n: StoreNotification) => {
    patchNotificationStatus(n.id, "read");
    await patchNotification(n.id, { status: "read", feedback: "opened" });
  };
  const archive = async (n: StoreNotification) => {
    patchNotificationStatus(n.id, "archived");
    await patchNotification(n.id, { status: "archived", feedback: "dismissed" });
  };
  const act = async (n: StoreNotification) => {
    patchNotificationStatus(n.id, "read");
    await patchNotification(n.id, { status: "read", feedback: "acted" });
  };

  const readAll = async () => {
    for (const n of items) if (n.status === "unread") patchNotificationStatus(n.id, "read");
    await fetch("/api/notifications/read-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
            <p className="text-xs text-slate-500">{unreadCount} unread</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2">
          {(["unread", "all", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={readAll} className="ml-auto text-xs font-medium text-indigo-600 hover:underline">
            Mark all read
          </button>
        </div>

        <div
          ref={containerRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="relative flex-1 overflow-y-auto"
          style={{ height: VIEWPORT_HEIGHT }}
        >
          {items.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Nothing here.</p>
          ) : (
            <div style={{ height: totalHeight, position: "relative" }}>
              {visibleItems.map((n, i) => {
                const index = startIndex + i;
                return (
                  <div
                    key={n.id}
                    style={{ position: "absolute", top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}
                    className="border-b border-slate-100 px-5 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {n.status === "unread" && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" />}
                          <p className="truncate text-sm font-medium text-slate-900">{n.title}</p>
                          {n.occurrenceCount > 1 && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">
                              ×{n.occurrenceCount}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">{n.body}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {SEVERITY_LABEL[n.severity] ?? n.severity} · {n.domain} · {DELIVERY_LABEL[n.delivery] ?? n.delivery} ·{" "}
                          {formatRelativeTime(n.createdAt, now)}
                        </p>
                        <p className="mt-1 truncate text-[11px] italic text-slate-400" title={n.reason}>
                          why: {n.reason || "default in-app delivery"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {n.status !== "archived" && (
                          <>
                            {n.status === "unread" && (
                              <button onClick={() => markRead(n)} className="text-[11px] font-medium text-indigo-600 hover:underline">
                                Read
                              </button>
                            )}
                            <button onClick={() => act(n)} className="text-[11px] font-medium text-emerald-600 hover:underline">
                              Acted
                            </button>
                            <button onClick={() => archive(n)} className="text-[11px] font-medium text-slate-500 hover:underline">
                              Archive
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
