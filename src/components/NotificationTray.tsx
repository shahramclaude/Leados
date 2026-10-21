"use client";

// Compact header tray: unread count + bell. Opens NotificationDrawer.
// Realtime-aware (via useRealtimeIntelligence) but degrades fine if the
// stream is unavailable — the unread count simply updates on the next
// poll/fetch instead of instantly.

import { useEffect, useState } from "react";
import { useRealtimeIntelligence } from "@/hooks/useRealtimeIntelligence";
import NotificationDrawer from "@/components/NotificationDrawer";

export default function NotificationTray() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { status, frames } = useRealtimeIntelligence();

  async function refreshCount() {
    try {
      const res = await fetch("/api/notifications?state=unread&limit=50", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Array.isArray(data.items) ? data.items.length : 0);
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    refreshCount();
  }, []);

  useEffect(() => {
    if (frames.some((f) => f.type === "notification")) {
      refreshCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length]);

  const dotColor = status === "open" ? "bg-emerald-500" : status === "polling" ? "bg-amber-500" : "bg-slate-400";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-200 hover:bg-slate-50"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${dotColor}`} title={`realtime: ${status}`} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationDrawer onClose={() => setOpen(false)} onChanged={refreshCount} />}
    </div>
  );
}
