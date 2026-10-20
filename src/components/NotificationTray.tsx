"use client";

// Bell icon + unread badge + connection status dot. Opens the
// NotificationDrawer. Kept intentionally tiny/cheap to render since it sits
// in the global header.

import { useState } from "react";
import { useNotificationStoreState } from "@/hooks/useNotificationStoreState";
import { NotificationDrawer } from "./NotificationDrawer";

const STATUS_COLOR: Record<string, string> = {
  connecting: "bg-amber-400",
  open: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  closed: "bg-slate-400",
};

export function NotificationTray() {
  const [open, setOpen] = useState(false);
  const { unreadCount, connectionStatus } = useNotificationStoreState();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
      >
        <span aria-hidden className="text-lg">🔔</span>
        <span
          className={`absolute right-1 top-1 h-2 w-2 rounded-full ${STATUS_COLOR[connectionStatus] ?? "bg-slate-400"}`}
          title={`Realtime: ${connectionStatus}`}
        />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && <NotificationDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
