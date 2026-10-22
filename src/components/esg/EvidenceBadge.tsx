import { Explain, EVIDENCE_LABEL, confidenceTier } from "@/lib/evidence";

const TIER_STYLES: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-orange-50 text-orange-700 border-orange-200",
  none: "bg-slate-100 text-slate-500 border-slate-200",
};

export function EvidenceBadge({ explain, compact }: { explain: Explain<number>; compact?: boolean }) {
  const tier = confidenceTier(explain.evidenceClass);
  const pct = (explain.uncertaintyPct * 100).toFixed(0);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TIER_STYLES[tier]}`}
      title={`${EVIDENCE_LABEL[explain.evidenceClass]} · method: ${explain.method} · uncertainty ±${pct}%${explain.notes ? " · " + explain.notes : ""}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {compact ? `±${pct}%` : `${EVIDENCE_LABEL[explain.evidenceClass]} · ±${pct}%`}
    </span>
  );
}

export function FigureCard({
  label,
  explain,
  unit,
  standardMapping,
}: {
  label: string;
  explain: Explain<number>;
  unit: string;
  standardMapping?: string[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {explain.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
        <span className="text-sm font-normal text-slate-500">{unit}</span>
      </p>
      <div className="mt-3">
        <EvidenceBadge explain={explain} />
      </div>
      {standardMapping && standardMapping.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">Mapped: {standardMapping.join(" · ")}</p>
      )}
      {explain.qualityMix && Object.keys(explain.qualityMix).length > 1 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Mix:{" "}
          {Object.entries(explain.qualityMix)
            .map(([k, v]) => `${k} ${(100 * (v ?? 0)).toFixed(0)}%`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

export function GapCard({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-400">No data</p>
      <p className="mt-2 text-[11px] text-slate-500">{reason}</p>
    </div>
  );
}
