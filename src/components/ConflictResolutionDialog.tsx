"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { ConflictMutation } from "@/lib/offlineQueue";
import { submitConflictResolution } from "@/lib/offlineQueue";
import { trapFocus } from "@/lib/a11y";

/**
 * User-facing conflict resolution (Section D). Appears when an offline edit
 * collides with a change made elsewhere while the device was offline.
 * Never auto-resolves — the user explicitly picks a side, which is recorded
 * server-side as a normal, audited write (see `/api/sync`).
 */
export default function ConflictResolutionDialog({
  conflict,
  onResolved,
}: {
  conflict: ConflictMutation;
  onResolved: () => void;
}) {
  const t = useTranslations("pwa");
  const dialogRef = useRef<HTMLDivElement>(null);

  async function resolve(choice: "keepMine" | "keepTheirs") {
    await submitConflictResolution(conflict, choice);
    onResolved();
  }

  const serverName = (conflict.server?.name as string) ?? (conflict.server?.title as string) ?? conflict.label;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`conflict-title-${conflict.clientId}`}
      ref={dialogRef}
      onKeyDown={(e) => dialogRef.current && trapFocus(dialogRef.current, e as unknown as KeyboardEvent)}
      className="mx-4 my-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p id={`conflict-title-${conflict.clientId}`} className="font-semibold">
        {t("conflict.title")}
      </p>
      <p className="mt-1">{t("conflict.body", { name: serverName })}</p>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-amber-300 bg-white p-2">
          <dt className="text-xs uppercase tracking-wide text-amber-700">{t("conflict.keepMine")}</dt>
          <dd className="mt-1 break-words text-slate-800">{JSON.stringify(conflict.patch)}</dd>
        </div>
        <div className="rounded-lg border border-amber-300 bg-white p-2">
          <dt className="text-xs uppercase tracking-wide text-amber-700">{t("conflict.keepTheirs")}</dt>
          <dd className="mt-1 break-words text-slate-800">{JSON.stringify(conflict.server)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => resolve("keepMine")}
          className="touch-target rounded-lg bg-amber-600 px-4 py-2 font-medium text-white"
        >
          {t("conflict.keepMine")}
        </button>
        <button
          type="button"
          onClick={() => resolve("keepTheirs")}
          className="touch-target rounded-lg border border-amber-600 px-4 py-2 font-medium text-amber-900"
        >
          {t("conflict.keepTheirs")}
        </button>
      </div>
    </div>
  );
}
