"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/format";
import { flushQueue, listQueue, queueEvents, resolveConflict } from "@/lib/offline/queue";
import type { QueuedWrite } from "@/lib/offline/db";
import { ConflictDialog } from "@/components/ConflictDialog";

export function SyncDrawer() {
  const { locale } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueuedWrite[]>([]);
  const [online, setOnline] = useState(true);
  const [activeConflict, setActiveConflict] = useState<QueuedWrite | null>(null);

  async function refresh() {
    setItems(await listQueue());
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();

    const onChange = () => void refresh();
    const onOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const onOffline = () => setOnline(false);

    queueEvents.addEventListener("change", onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      queueEvents.removeEventListener("change", onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const queuedCount = items.filter((i) => i.status !== "done").length;
  const conflictCount = items.filter((i) => i.status === "conflict").length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lx-tap-target relative inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true">{online ? "🟢" : "🔴"}</span>
        <span>{online ? t(locale, "common.online") : t(locale, "common.offline")}</span>
        {queuedCount > 0 && (
          <span
            className={`ml-1 inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold text-white ${
              conflictCount > 0 ? "bg-amber-600" : "bg-slate-600"
            }`}
          >
            {queuedCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={t(locale, "sync.drawerTitle")}>
          <div className="lx-surface w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{t(locale, "sync.drawerTitle")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="lx-tap-target rounded-full px-3 py-2 text-slate-600 hover:bg-slate-100"
                aria-label={t(locale, "common.cancel")}
              >
                ✕
              </button>
            </div>

            <p className="lx-muted mt-2 text-sm text-slate-600">
              {queuedCount === 0 ? t(locale, "sync.synced") : t(locale, "sync.queued", { count: queuedCount })}
            </p>

            <ul className="mt-4 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="lx-surface rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.description}</p>
                      <p className="lx-muted text-xs text-slate-500">
                        {t(locale, "common.lastUpdated", { relativeTime: formatRelativeTime(locale, item.createdAt) })}
                      </p>
                    </div>
                    <StatusChip status={item.status} locale={locale} />
                  </div>
                  {item.status === "conflict" && (
                    <button
                      type="button"
                      onClick={() => setActiveConflict(item)}
                      className="lx-tap-target mt-3 w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {t(locale, "sync.conflict")}
                    </button>
                  )}
                </li>
              ))}
              {items.length === 0 && <li className="lx-muted text-sm text-slate-500">{t(locale, "common.noResults")}</li>}
            </ul>
          </div>
        </div>
      )}

      {activeConflict && (
        <ConflictDialog
          item={activeConflict}
          onClose={() => setActiveConflict(null)}
          onResolve={async (resolution) => {
            await resolveConflict(activeConflict.id, resolution);
            setActiveConflict(null);
            void refresh();
          }}
        />
      )}
    </>
  );
}

function StatusChip({ status, locale }: { status: QueuedWrite["status"]; locale: Parameters<typeof t>[0] }) {
  const palette: Record<QueuedWrite["status"], string> = {
    queued: "bg-slate-100 text-slate-700",
    syncing: "bg-blue-100 text-blue-700",
    conflict: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-700",
    done: "bg-green-100 text-green-700",
  };
  const labelKey: Record<QueuedWrite["status"], string> = {
    queued: "common.offline",
    syncing: "sync.syncing",
    conflict: "sync.conflict",
    failed: "common.error",
    done: "sync.synced",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${palette[status]}`}>{t(locale, labelKey[status])}</span>;
}
