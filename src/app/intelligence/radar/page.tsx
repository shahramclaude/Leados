import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { crisisElevations, externalSignals, externalSources } from "@/db/schema";
import { EvidenceChip } from "@/components/EvidenceChip";
import { sensingNotAvailableNotice } from "@/lib/seams/part13-sensing";

export const dynamic = "force-dynamic";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  moderate: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-rose-100 text-rose-700",
};

const RELIABILITY_LABEL: Record<string, string> = {
  tier1_verified: "Tier 1 · Verified source",
  tier2_reported: "Tier 2 · Reported source",
  tier3_unverified: "Tier 3 · Unverified source",
};

export default async function ExternalRadarPage() {
  const signals = await db
    .select({
      id: externalSignals.id,
      title: externalSignals.title,
      summary: externalSignals.summary,
      signalType: externalSignals.signalType,
      severity: externalSignals.severity,
      evidenceClass: externalSignals.evidenceClass,
      publishedAt: externalSignals.publishedAt,
      escalated: externalSignals.escalated,
      sourceName: externalSources.name,
      reliabilityClass: externalSources.reliabilityClass,
    })
    .from(externalSignals)
    .innerJoin(externalSources, eq(externalSignals.sourceId, externalSources.id))
    .orderBy(desc(externalSignals.publishedAt));

  const elevations = await db
    .select({
      id: crisisElevations.id,
      reason: crisisElevations.reason,
      thresholdBreached: crisisElevations.thresholdBreached,
      elevatedAt: crisisElevations.elevatedAt,
      signalTitle: externalSignals.title,
    })
    .from(crisisElevations)
    .innerJoin(externalSignals, eq(crisisElevations.signalId, externalSignals.id))
    .orderBy(desc(crisisElevations.elevatedAt));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">External Radar</h2>
        <p className="mt-2 text-sm text-slate-600">{sensingNotAvailableNotice()}</p>
      </section>

      {elevations.length > 0 ? (
        <section className="rounded-2xl border border-rose-300 bg-rose-50 p-6">
          <h3 className="text-base font-semibold text-rose-800">Crisis elevations (Part 47 seam)</h3>
          <ul className="mt-3 space-y-2">
            {elevations.map((e) => (
              <li key={e.id} className="rounded-lg border border-rose-200 bg-white p-3 text-sm">
                <p className="font-medium text-rose-800">{e.signalTitle}</p>
                <p className="text-rose-600">{e.reason}</p>
                <p className="text-xs text-rose-400">threshold: {e.thresholdBreached}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-base font-semibold text-slate-950">Signal feed</h3>
        <ul className="mt-4 space-y-4">
          {signals.map((s) => (
            <li key={s.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-medium text-slate-900">{s.title}</h4>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOR[s.severity]}`}>
                  {s.severity}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{s.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <EvidenceChip evidenceClass={s.evidenceClass} sourceRef={s.sourceName} />
                <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                  {RELIABILITY_LABEL[s.reliabilityClass] ?? s.reliabilityClass}
                </span>
                {s.escalated ? (
                  <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                    escalated to crisis
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
