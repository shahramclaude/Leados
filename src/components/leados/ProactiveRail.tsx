"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type StreamEventType = "finding" | "work_item" | "notification" | "run" | "connected";

interface StreamEvent {
  type: StreamEventType;
  action: string;
  payload: unknown;
  ts: string;
}

interface NotificationRow {
  id: number;
  type: string;
  severity: number;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  entityType: string | null;
  entityId: number | null;
}

interface FeedItem {
  key: string;
  type: StreamEventType;
  severity: number;
  title: string;
  body: string;
  ts: string;
}

const TYPE_ICON: Record<StreamEventType, string> = {
  finding: "🔎",
  work_item: "🗂️",
  notification: "🔔",
  run: "⏱️",
  connected: "🟢",
};

const SEVERITY_CLASSES: Record<number, string> = {
  5: "border-red-300 bg-red-50 text-red-800",
  4: "border-orange-300 bg-orange-50 text-orange-800",
  3: "border-amber-300 bg-amber-50 text-amber-800",
  2: "border-sky-300 bg-sky-50 text-sky-800",
  1: "border-slate-300 bg-slate-50 text-slate-700",
};

function severityClass(sev: number) {
  return SEVERITY_CLASSES[Math.max(1, Math.min(5, Math.round(sev) || 1))];
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function feedItemFromPayload(type: StreamEventType, action: string, ts: string, payload: unknown): FeedItem {
  const p = (payload ?? {}) as Record<string, unknown>;
  const title = typeof p.title === "string" ? p.title : typeof p.summary === "string" ? p.summary : `${type} ${action}`;
  const body = typeof p.body === "string" ? p.body : typeof p.detail === "string" ? p.detail : "";
  const severity = typeof p.severity === "number" ? p.severity : typeof p.sev === "number" ? p.sev : typeof p.priority === "number" ? p.priority : 1;
  return {
    key: `${type}:${action}:${ts}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity,
    title: action === "resolved" && type === "finding" ? `Resolved: ${title}` : title,
    body,
    ts,
  };
}

export default function ProactiveRail() {
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?pageSize=10");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // ignore transient failures; SSE will keep us current
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const es = new EventSource("/api/events/stream");
      esRef.current = es;

      es.addEventListener("connected", () => {
        setConnected(true);
        retryRef.current = 1000;
      });

      const pushFeed = (type: StreamEventType, action: string, ts: string, payload: unknown) => {
        setFeed((prev) => [feedItemFromPayload(type, action, ts, payload), ...prev].slice(0, 10));
      };

      es.addEventListener("finding", (ev: MessageEvent) => {
        const data: StreamEvent = JSON.parse(ev.data);
        pushFeed("finding", data.action, data.ts, data.payload);
      });

      es.addEventListener("work_item", (ev: MessageEvent) => {
        const data: StreamEvent = JSON.parse(ev.data);
        pushFeed("work_item", data.action, data.ts, data.payload);
      });

      es.addEventListener("run", (ev: MessageEvent) => {
        const data: StreamEvent = JSON.parse(ev.data);
        pushFeed("run", data.action, data.ts, data.payload);
      });

      es.addEventListener("notification", (ev: MessageEvent) => {
        const data: StreamEvent = JSON.parse(ev.data);
        if (data.action === "new") {
          const row = data.payload as NotificationRow;
          setNotifications((prev) => [row, ...prev].slice(0, 20));
          setUnreadCount((c) => c + 1);
          pushFeed("notification", data.action, data.ts, row);
        } else if (data.action === "all_read") {
          setNotifications([]);
          setUnreadCount(0);
        } else if (data.action === "read") {
          const row = data.payload as NotificationRow;
          setNotifications((prev) => prev.filter((n) => n.id !== row.id));
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (esRef.current === es) esRef.current = null;
        if (cancelled) return;
        const delay = Math.min(retryRef.current, 15000);
        reconnectTimer.current = setTimeout(connect, delay);
        retryRef.current = Math.min(retryRef.current * 2, 15000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      esRef.current?.close();
    };
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", { method: "DELETE" });
    } catch {
      // next SSE/poll cycle will reconcile
    }
  }, []);

  return (
    <aside className="flex h-full w-full max-w-sm flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-300"}`}
            title={connected ? "Live" : "Reconnecting…"}
          />
          <h2 className="text-sm font-semibold text-slate-900">Proactive Intelligence</h2>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
              {unreadCount}
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0 && notifications.length === 0}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {notifications.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Unread notifications
            </p>
            <ul className="flex flex-col gap-1.5">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`rail-slide-in rounded-xl border px-3 py-2 text-xs ${severityClass(n.severity)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{n.title}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 opacity-90">{n.body}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Live feed
        </p>
        {feed.length === 0 ? (
          <p className="px-1 text-xs text-slate-400">
            Waiting for the background intelligence loop… trigger a cycle to see live updates here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {feed.map((item) => (
              <li
                key={item.key}
                className={`rail-slide-in flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${severityClass(item.severity)}`}
              >
                <span className="mt-0.5">{TYPE_ICON[item.type]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{item.title}</span>
                    <span className="shrink-0 text-[10px] opacity-70">{timeAgo(item.ts)}</span>
                  </div>
                  {item.body && <p className="mt-0.5 line-clamp-2 opacity-90">{item.body}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
