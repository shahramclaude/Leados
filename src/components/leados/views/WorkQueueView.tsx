"use client";

import { useState } from "react";
import { useAppContext } from "@/lib/AppContext";
import { SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/domains";

export default function WorkQueueView() {
  const { notifications, unreadCount, markNotificationRead, loading } = useAppContext();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const markAllRead = async () => {
    notifications.forEach((n) => {
      if (!n.read) markNotificationRead(n.id, true);
    });
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Work Queue</h1>
          <p className="text-sm text-slate-500">{unreadCount} unread notification(s)</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5 text-xs">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 capitalize ${filter === f ? "bg-indigo-600 text-white" : "text-slate-400"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={() => void markAllRead()} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
            Mark all read
          </button>
        </div>
      </header>

      {loading && notifications.length === 0 ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-500">
          Queue is clear.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                n.read ? "border-slate-800 bg-slate-950/30" : "border-slate-700 bg-slate-900/60"
              }`}
            >
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[n.severity] }} title={SEVERITY_LABELS[n.severity]} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-100">{n.title}</p>
                  <span className="text-[10px] uppercase text-slate-500">{n.domain}</span>
                </div>
                <p className="text-xs text-slate-400">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-600">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => markNotificationRead(n.id, !n.read)}
                className="shrink-0 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
              >
                {n.read ? "Mark unread" : "Mark read"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
