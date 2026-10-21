"use client";

// ---------------------------------------------------------------------------
// Shows every queued mutation and its status. A mutation only disappears when
// it is applied by the server OR the user explicitly dismisses a failed/
// conflicted item (audited in offlineQueue.getDismissedAudit()).
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useUiStore, uiStore } from "@/lib/state/uiStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { dismissQueueItem, offlineQueue, trySend } from "@/lib/platform/integration/mutationQueue";
import type { QueueItem } from "@/lib/platform/integration/offlineQueue";

const STATUS_STYLE: Record<QueueItem["status"], string> = {
  pending: "bg-slate-100 text-slate-700",
  sending: "bg-blue-100 text-blue-700",
  applied: "bg-emerald-100 text-emerald-700",
  conflict: "bg-amber-100 text-amber-800",
  failed: "bg-rose-100 text-rose-700",
};

export function SyncDrawer() {
  const { syncDrawerOpen } = useUiStore();
  const online = useOnlineStatus();
  const [items, setItems] = useState<QueueItem[]>([]);

  useEffect(() => {
    void offlineQueue.hydrate().then(() => setItems(offlineQueue.list()));
    const unsubscribe = offlineQueue.subscribe(() => setItems(offlineQueue.list()));
    return () => {
      unsubscribe();
    };
  }, []);

  if (!syncDrawerOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="Sync queue"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Sync queue</h2>
        <button
          onClick={() => uiStore.toggleSyncDrawer(false)}
          className="rounded-md px-2 py-1 text-sm text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          Close
        </button>
      </div>

      <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${online ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
        {online ? "Online" : "Offline — changes are queued locally"}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing queued. Every change has reached the server.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.idempotencyKey} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status]}`}>
                  {item.status}
                </span>
              </div>
              {item.lastError && <p className="mt-1 text-xs text-rose-600">{item.lastError}</p>}
              <div className="mt-2 flex gap-2">
                {(item.status === "failed" || item.status === "pending") && (
                  <button
                    onClick={() => void trySend(item.idempotencyKey)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    Retry now
                  </button>
                )}
                {(item.status === "failed" || item.status === "conflict") && (
                  <button
                    onClick={() => void dismissQueueItem(item.idempotencyKey)}
                    className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    Dismiss (audited)
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
