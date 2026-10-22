import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives, listTeams } from "@/lib/strategy/initiatives";
import { cascadeCompletenessFor, detectCapacityConflicts, linkIntegrityFindings } from "@/lib/strategy/alignmentEngine";
import { findDrift } from "@/lib/strategy/driftRadar";
import type { Finding, FindingSeverity } from "@/lib/strategy/strategyModels";

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-800",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  info: "border-slate-300 bg-slate-50 text-slate-700",
};

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className={`rounded-xl border p-4 ${SEVERITY_STYLES[finding.severity]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{finding.summary}</p>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium uppercase">{finding.severity}</span>
      </div>
      <p className="mt-1 text-sm">{finding.detail}</p>
      <p className="mt-2 text-xs opacity-70">kind: {finding.kind}</p>
    </div>
  );
}

export default async function DriftRadarPage() {
  const [objectives, links, keyResults, initiatives, teams] = await Promise.all([
    listObjectives(),
    listObjectiveLinks(),
    listKeyResults(),
    listInitiatives(),
    listTeams(),
  ]);
  const evidence = await listEvidenceRefs();

  const integrityFindings = linkIntegrityFindings(objectives, links);
  const capacityFindings = detectCapacityConflicts(initiatives, teams);
  const cascadeFindings = objectives.flatMap((o) => cascadeCompletenessFor(o, keyResults, initiatives, evidence).findings);
  const driftFindings = findDrift(objectives, keyResults, evidence);

  const groups: { title: string; findings: Finding[]; blurb: string }[] = [
    {
      title: "Evidence vs. assertion drift",
      blurb: "Key results where the hand-typed number disagrees with the most recent evidence by more than 15 points.",
      findings: driftFindings,
    },
    {
      title: "Alignment graph integrity",
      blurb: "Cycles, orphan objectives, dangling links, and explicit objective conflicts.",
      findings: integrityFindings,
    },
    {
      title: "Cascade completeness",
      blurb: "Objectives missing key results, initiatives, or evidence.",
      findings: cascadeFindings,
    },
    {
      title: "Capacity conflicts",
      blurb: "Initiatives competing for the same scarce team skill with overlapping timelines.",
      findings: capacityFindings,
    },
  ];

  const allFindings = groups.flatMap((g) => g.findings);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Drift Radar</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Findings are recommendations to investigate, not verdicts. {allFindings.length} total (
          {allFindings.filter((f) => f.severity === "critical").length} critical,{" "}
          {allFindings.filter((f) => f.severity === "warning").length} warning).
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{group.title}</h2>
            <p className="text-sm text-slate-500">{group.blurb}</p>
          </div>
          {group.findings.length === 0 ? (
            <p className="text-sm text-slate-400">No findings in this category.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {group.findings.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
