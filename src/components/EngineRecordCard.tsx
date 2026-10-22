"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProviders";
import { t } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/format";
import { renderEngineRecord } from "@/lib/engine/render";
import { TrendBadge } from "@/components/TrendBadge";
import { performOrQueueWrite, resolveConflictNow, type ConflictResolution } from "@/lib/offline/queue";
import type { EngineRecordRow } from "@/lib/repo/engineRecords";

type RecordDTO = Pick<EngineRecordRow, "id" | "orgId" | "type" | "domain" | "templateKey" | "params" | "version" | "seeded" | "updatedAt">;

export function EngineRecordCard({ record, canWrite }: { record: RecordDTO; canWrite: boolean }) {
  const { locale, plainLanguage } = useApp();
  const router = useRouter();
  const rendered = renderEngineRecord(record, locale, plainLanguage);
  const trend = record.params.trendDirection as "up" | "down" | "flat" | undefined;
  const trendValue = Number(record.params.trendValue ?? 0);

  const [bumping, setBumping] = useState(false);
  const [conflict, setConflict] = useState<{ serverRecord: { version: number; params: Record<string, unknown> }; attempted: Record<string, unknown> } | null>(null);
  const [queuedNotice, setQueuedNotice] = useState(false);

  async function bumpTrend() {
    setBumping(true);
    const attempted = { ...record.params, trendValue: trendValue + 1 };
    const result = await performOrQueueWrite({
      method: "PATCH",
      url: `/api/orgs/${record.orgId}/records/${record.id}`,
      body: { expectedVersion: record.version, params: attempted },
      description: rendered.title,
    });

    if (result.status === "queued") {
      setQueuedNotice(true);
    } else if (result.status === "conflict") {
      const data = result.data as { serverRecord: { version: number; params: Record<string, unknown> } };
      setConflict({ serverRecord: data.serverRecord, attempted });
    } else {
      router.refresh();
    }
    setBumping(false);
  }

  async function resolve(resolution: ConflictResolution) {
    if (!conflict) return;
    await resolveConflictNow(
      `/api/orgs/${record.orgId}/records/${record.id}`,
      "PATCH",
      conflict.serverRecord,
      conflict.attempted,
      resolution,
    );
    setConflict(null);
    router.refresh();
  }

  return (
    <li className="lx-surface rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{rendered.title}</h3>
        {record.seeded && (
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
            {t(locale, "onboarding.sampleBadge")}
          </span>
        )}
      </div>

      <p className="lx-muted mt-2 text-sm leading-relaxed text-slate-700">{rendered.body}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {trend && <TrendBadge locale={locale} trend={trend} value={trendValue} />}
        <span className="lx-muted text-xs text-slate-500">{t(locale, "common.version", { version: record.version })}</span>
        <span className="lx-muted text-xs text-slate-500">
          {t(locale, "common.lastUpdated", { relativeTime: formatRelativeTime(locale, record.updatedAt) })}
        </span>
      </div>

      {canWrite && (
        <button
          type="button"
          onClick={bumpTrend}
          disabled={bumping}
          className="lx-tap-target mt-4 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 sm:w-auto"
        >
          {bumping ? t(locale, "common.loading") : "+1 trend (demo edit)"}
        </button>
      )}

      {queuedNotice && (
        <p className="lx-muted mt-2 text-xs text-amber-700" role="status">
          {t(locale, "common.offline")}
        </p>
      )}

      {conflict && (
        <div className="lx-surface mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">{t(locale, "sync.conflictTitle")}</p>
          <p className="mt-1 text-sm text-amber-900">
            {t(locale, "sync.conflictExplain", {
              theirVersion: conflict.serverRecord.version,
              mineVersion: record.version,
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => resolve("mine")} className="lx-tap-target rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white">
              {t(locale, "sync.resolveMine")}
            </button>
            <button type="button" onClick={() => resolve("theirs")} className="lx-tap-target rounded-lg border border-amber-900 px-3 py-2 text-xs font-semibold text-amber-900">
              {t(locale, "sync.resolveTheirs")}
            </button>
            <button type="button" onClick={() => resolve("merge")} className="lx-tap-target rounded-lg border border-amber-900 px-3 py-2 text-xs font-semibold text-amber-900">
              {t(locale, "sync.resolveMerge")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
