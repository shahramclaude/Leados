"use client";

import { useCommandStack } from "@/lib/state/useCommandStack";
import { uiStore } from "@/lib/state/uiStore";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useEffect, useState } from "react";
import { offlineQueue } from "@/lib/platform/integration/mutationQueue";

export function TopBar() {
  const { canUndo, canRedo, undo, redo, undoLabel, redoLabel, busy } = useCommandStack();
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void offlineQueue.hydrate().then(() => setPending(offlineQueue.pendingCount()));
    const unsubscribe = offlineQueue.subscribe(() => setPending(offlineQueue.pendingCount()));
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-8">
      <button
        onClick={() => uiStore.togglePalette(true)}
        className="flex w-full max-w-sm items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      >
        <span>Search or run a command…</span>
        <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-slate-400 shadow-sm">⌘K</kbd>
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void undo()}
          disabled={!canUndo || busy}
          title={undoLabel ? `Undo: ${undoLabel}` : "Nothing to undo"}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button
          onClick={() => void redo()}
          disabled={!canRedo || busy}
          title={redoLabel ? `Redo: ${redoLabel}` : "Nothing to redo"}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↷ Redo
        </button>
        <button
          onClick={() => uiStore.toggleSyncDrawer(true)}
          className="relative rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          Sync
          {pending > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-white">
              {pending}
            </span>
          )}
        </button>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
            online ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-rose-500"}`} />
          {online ? "Online" : "Offline"}
        </span>
      </div>
    </header>
  );
}
