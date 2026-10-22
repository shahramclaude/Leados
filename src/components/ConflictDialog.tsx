"use client";

import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import type { QueuedWrite } from "@/lib/offline/db";
import type { ConflictResolution } from "@/lib/offline/queue";

export function ConflictDialog({
  item,
  onClose,
  onResolve,
}: {
  item: QueuedWrite;
  onClose: () => void;
  onResolve: (resolution: ConflictResolution) => void | Promise<void>;
}) {
  const { locale } = useApp();
  const conflict = item.conflict;
  const theirVersion = (conflict?.serverRecord as { version?: number } | undefined)?.version ?? "?";
  const mineVersion = ((item.body as { expectedVersion?: number } | undefined)?.expectedVersion ?? "?") as number | string;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
    >
      <div className="lx-surface w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="conflict-title" className="text-lg font-semibold text-slate-900">
          {t(locale, "sync.conflictTitle")}
        </h2>
        <p className="lx-muted mt-2 text-sm text-slate-700">
          {t(locale, "sync.conflictExplain", { theirVersion, mineVersion })}
        </p>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={() => onResolve("mine")}
            className="lx-tap-target rounded-lg border-2 border-[color:var(--accent)] bg-white px-4 py-3 text-left text-sm font-semibold text-[color:var(--accent)]"
          >
            {t(locale, "sync.resolveMine")}
          </button>
          <button
            type="button"
            onClick={() => onResolve("theirs")}
            className="lx-tap-target rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800"
          >
            {t(locale, "sync.resolveTheirs")}
          </button>
          <button
            type="button"
            onClick={() => onResolve("merge")}
            className="lx-tap-target rounded-lg border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800"
          >
            {t(locale, "sync.resolveMerge")}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="lx-tap-target mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t(locale, "common.cancel")}
        </button>
      </div>
    </div>
  );
}
