"use client";

// Notification list UI. Virtualized (manual windowing, no extra dependency):
// only rows inside the visible scroll range + overscan are mounted, so the
// list stays fast even with hundreds of chained notifications. Cursor
// pagination loads more as the user scrolls near the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNowTick, timeAgo } from "@/hooks/useNowTick";

interface NotificationItem {
  id: string;
  class: "alert" | "action" | "info" | "digest";
  severity: number;
  domain: string;
  title: string;
  body: string;
  state: "unread" | "read" | "archived";
  createdAt: string;
  entityRef: string | null;
  explain: string | null;
  chainCount: number;
}

const ROW_HEIGHT = 92;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 4;

const CLASS_COLORS: Record<string, string> = {
  alert: "bg-rose-100 text-rose-700",
  action: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
  digest: "bg-slate-200 text-slate-700",
};

export default function NotificationDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"unread" | "all">("unread");
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const now = useNowTick();

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (filter === "unread") params.set("state", "unread");
        if (!reset && cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
        const data = await res.json();
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setCursor(data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [cursor, filter],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, state: "read" } : i)));
    onChanged();
  }

  async function archive(id: string, as: "acted" | "dismissed") {
    await fetch(`/api/notifications/${id}/archive?as=${as}`, { method: "POST" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    onChanged();
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST", body: JSON.stringify({}) });
    setItems((prev) => prev.map((i) => ({ ...i, state: "read" })));
    onChanged();
  }

  const totalHeight = items.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visible = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const top = e.currentTarget.scrollTop;
    setScrollTop(top);
    const nearBottom = top + e.currentTarget.clientHeight > e.currentTarget.scrollHeight - ROW_HEIGHT * 3;
    if (nearBottom && cursor && !loading) load(false);
  }

  return (
    <div className="absolute right-0 top-12 z-50 w-[420px] rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter((f) => (f === "unread" ? "all" : "unread"))}
            className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            {filter === "unread" ? "Unread" : "All"}
          </button>
          <button onClick={markAllRead} className="text-xs font-medium text-indigo-600 hover:underline">
            Mark all read
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      <div ref={containerRef} onScroll={handleScroll} style={{ height: VIEWPORT_HEIGHT, overflowY: "auto" }} className="relative">
        {items.length === 0 && !loading && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">You're caught up.</p>
        )}
        <div style={{ height: totalHeight, position: "relative" }}>
          {visible.map((item, i) => {
            const index = startIndex + i;
            return (
              <div
                key={item.id}
                style={{ position: "absolute", top: index * ROW_HEIGHT, height: ROW_HEIGHT, width: "100%" }}
                className={`border-b border-slate-50 px-4 py-2 ${item.state === "unread" ? "bg-indigo-50/40" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${CLASS_COLORS[item.class]}`}>
                        {item.class}
                      </span>
                      <span className="text-[11px] text-slate-400">{item.domain}</span>
                      {item.chainCount > 1 && (
                        <span className="text-[11px] text-slate-400">·{item.chainCount} in chain</span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-[11px] text-slate-400">{timeAgo(item.createdAt, now)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.state === "unread" && (
                      <button onClick={() => markRead(item.id)} className="text-[11px] font-medium text-indigo-600 hover:underline">
                        Read
                      </button>
                    )}
                    <button onClick={() => archive(item.id, "acted")} className="text-[11px] font-medium text-emerald-600 hover:underline">
                      Done
                    </button>
                    <button onClick={() => archive(item.id, "dismissed")} className="text-[11px] text-slate-400 hover:underline">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {loading && <p className="py-3 text-center text-xs text-slate-400">Loading…</p>}
      </div>
    </div>
  );
}
