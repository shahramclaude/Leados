"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { flushQueue, getConflicts, getQueue, type ConflictMutation } from "@/lib/offlineQueue";
import ConflictResolutionDialog from "@/components/ConflictResolutionDialog";

/**
 * Persistent, locale-aware status strip (Section D). Shows offline state,
 * the queued-write count, and surfaces conflicts for resolution — never
 * silently drops or silently overwrites a change.
 */
export default function PwaStatusBanner() {
  const t = useTranslations("pwa");
  const [online, setOnline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [conflicts, setConflicts] = useState<ConflictMutation[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    const [queue, conflictList] = await Promise.all([getQueue(), getConflicts()]);
    setQueuedCount(queue.length);
    setConflicts(conflictList);
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();

    const onOnline = async () => {
      setOnline(true);
      setSyncing(true);
      await flushQueue();
      await refresh();
      setSyncing(false);
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    const interval = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {!online && (
        <div role="status" className="bg-amber-100 text-amber-900 px-4 py-2 text-sm border-b border-amber-300">
          {t("offlineBanner")}
        </div>
      )}
      {online && syncing && (
        <div role="status" className="bg-blue-50 text-blue-900 px-4 py-2 text-sm border-b border-blue-200">
          {t("syncingBanner")}
        </div>
      )}
      {queuedCount > 0 && (
        <div role="status" className="bg-slate-100 text-slate-800 px-4 py-2 text-sm border-b border-slate-300">
          {t("queuedBanner", { count: queuedCount })}
        </div>
      )}
      {conflicts.map((conflict) => (
        <ConflictResolutionDialog key={conflict.clientId} conflict={conflict} onResolved={refresh} />
      ))}
    </>
  );
}
