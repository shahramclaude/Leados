import { useEffect, useMemo, useState } from "react";
import type { ProjectedFinding, Severity } from "../lib/core";
import { registerView, shouldNotifyCompaction, type FamiliarityTier } from "../lib/familiarity";
import { solveCardHeight } from "../lib/cssolver";

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "bg-slate-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-rose-500",
};

function FindingCard({ finding, tier }: { finding: ProjectedFinding; tier: FamiliarityTier }) {
  const layout = solveCardHeight(typeof window !== "undefined" ? window.innerHeight : 900, 6);

  if (tier === "HABITUATED") {
    return (
      <tr className="border-b border-slate-800 text-sm">
        <td className="py-2 pr-3">
          <span className={`inline-block h-2 w-2 rounded-full ${SEVERITY_COLOR[finding.severity]}`} />
        </td>
        <td className="py-2 pr-3 text-slate-200">{finding.title}</td>
        <td className="py-2 pr-3 text-slate-500 capitalize">{finding.domain}</td>
        <td className="py-2 text-slate-500">{Math.round(finding.ageDays)}d</td>
      </tr>
    );
  }

  return (
    <div
      className="fin rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col gap-2 animate-[fadeIn_200ms_ease-out]"
      style={{ minHeight: tier === "NOVEL" ? undefined : layout.cardHeightPx }}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_COLOR[finding.severity]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-slate-100 truncate">{finding.title}</h3>
            <span className="text-[10px] uppercase tracking-wide text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
              {tier}
            </span>
          </div>
          <div className="text-xs text-slate-500 capitalize">
            {finding.domain} &middot; {Math.round(finding.ageDays)}d old &middot; {finding.severity}
          </div>
        </div>
      </div>

      {tier !== "FAMILIAR" && <p className="text-sm text-slate-400">{finding.detail}</p>}

      {tier === "NOVEL" && (
        <div className="mt-1 rounded-md bg-slate-950/60 border border-slate-800 p-2 text-[11px] text-slate-500 space-y-1">
          <div>
            <span className="text-slate-400">confidence (fabricated proxy, disclosed):</span>{" "}
            {Math.round((finding.severity === "critical" ? 0.92 : finding.severity === "high" ? 0.8 : finding.severity === "medium" ? 0.65 : 0.45) * 100)}%
          </div>
          <div>
            <span className="text-slate-400">score math:</span> severity_weight &times; decay^age &mdash; this finding
            has no native confidence field; the number above is a disclosed stand-in, not a measured model output.
          </div>
        </div>
      )}
    </div>
  );
}

export function TodayView({ findings }: { findings: ProjectedFinding[] }) {
  const open = useMemo(() => findings.filter((f) => !f.resolved), [findings]);
  const [tiers, setTiers] = useState<Record<string, FamiliarityTier>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, FamiliarityTier> = {};
    let pendingToast: string | null = null;
    for (const f of open) {
      const tier = registerView(f.findingId);
      next[f.findingId] = tier;
      if (shouldNotifyCompaction(f.findingId, tier) && !pendingToast) {
        pendingToast = `"${f.title}" compacted to ${tier} (adaptation is never silent).`;
      }
    }
    setTiers(next);
    if (pendingToast) {
      setToast(pendingToast);
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open.map((f) => f.findingId).join(",")]);

  const allHabituated = open.length > 0 && open.every((f) => tiers[f.findingId] === "HABITUATED");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Today</h1>
        <p className="text-sm text-slate-500">
          {open.length} active finding{open.length === 1 ? "" : "s"}. Cards render through four
          familiarity tiers (NOVEL &rarr; LEARNING &rarr; FAMILIAR &rarr; HABITUATED) tracked in{" "}
          <code className="text-indigo-300">sessionStorage</code>, resetting every session.
        </p>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-indigo-600 text-white text-sm px-4 py-2 shadow-lg z-50">
          {toast}
        </div>
      )}

      {open.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500 text-sm">
          No active findings. Reseed from the Log view to explore the demo data.
        </div>
      )}

      {allHabituated ? (
        <table className="w-full">
          <tbody>
            {open.map((f) => (
              <FindingCard key={f.findingId} finding={f} tier="HABITUATED" />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {open.map((f) => (
            <FindingCard key={f.findingId} finding={f} tier={tiers[f.findingId] || "NOVEL"} />
          ))}
        </div>
      )}
    </div>
  );
}
