"use client";

import { VirtualList } from "./VirtualList";

export type NotificationRow = {
  id: number;
  created_at: string;
  title: string;
  body: string;
  severity: string;
  read: boolean;
};

const DOT_COLOR: Record<string, string> = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};

export function NotificationsPanel({ items }: { items: NotificationRow[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">Notifications ({items.length.toLocaleString()})</h3>
      </div>
      <VirtualList
        items={items}
        rowHeight={52}
        height={320}
        emptyState={<div className="flex h-full items-center justify-center text-sm text-slate-400">No notifications</div>}
        renderRow={(row) => (
          <div className="flex items-start gap-2 border-b border-slate-50 px-4 py-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[row.severity] ?? "bg-slate-400"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-700">{row.title}</p>
              <p className="truncate text-[11px] text-slate-400">{row.body}</p>
            </div>
            <span className="shrink-0 text-[10px] text-slate-300">{new Date(row.created_at).toLocaleTimeString()}</span>
          </div>
        )}
      />
    </div>
  );
}

export default NotificationsPanel;
