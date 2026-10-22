import Link from "next/link";
import { SeedButton } from "./_components/SeedButton";
import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives, listTeams } from "@/lib/strategy/initiatives";
import { cascadeCompletenessFor, detectCapacityConflicts, linkIntegrityFindings } from "@/lib/strategy/alignmentEngine";
import { findDrift } from "@/lib/strategy/driftRadar";
import { northStarCoverage } from "@/lib/strategy/northStar";

export const dynamic = "force-dynamic";

export default async function StrategyOverviewPage() {
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
  const allFindings = [...integrityFindings, ...capacityFindings, ...cascadeFindings, ...driftFindings];
  const coverage = northStarCoverage(initiatives, objectives, links);

  const cards = [
    { label: "Objectives", value: objectives.length },
    { label: "Key results", value: keyResults.length },
    { label: "Initiatives", value: initiatives.length },
    { label: "Critical findings", value: allFindings.filter((f) => f.severity === "critical").length },
    { label: "North-star coverage", value: `${Math.round(coverage.coverageRatio * 100)}%` },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Strategy Systems</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">Strategy overview</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Objective alignment, OKR evidence, portfolio prioritization, and execution scheduling in one place. Every
          number here is either computed from evidence or explicitly flagged as a hand-asserted estimate — see the
          Drift Radar for anywhere those two disagree.
        </p>
        <div className="mt-4">
          {objectives.length === 0 ? (
            <SeedButton />
          ) : (
            <p className="text-sm text-slate-500">
              Data loaded. Re-seed anytime to reset the demo dataset: <SeedButton />
            </p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/strategy/map"
          className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-400"
        >
          <h2 className="text-lg font-semibold text-slate-900">Strategy Map →</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cause-effect chain from objectives to outcomes, colored by drift state.
          </p>
        </Link>
        <Link
          href="/strategy/execution"
          className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-400"
        >
          <h2 className="text-lg font-semibold text-slate-900">Execution Board →</h2>
          <p className="mt-1 text-sm text-slate-600">
            Initiatives ranked by WSJF with PERT delivery dates, budget burn, and blockers.
          </p>
        </Link>
        <Link
          href="/strategy/drift"
          className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-400"
        >
          <h2 className="text-lg font-semibold text-slate-900">Drift Radar →</h2>
          <p className="mt-1 text-sm text-slate-600">
            Objectives whose evidence contradicts asserted progress, plus cascade/alignment findings.
          </p>
        </Link>
        <Link
          href="/strategy/review"
          className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-400"
        >
          <h2 className="text-lg font-semibold text-slate-900">Review Cadence →</h2>
          <p className="mt-1 text-sm text-slate-600">
            Weekly check-in prompts and the auto-assembled strategy brief, citing only real deltas.
          </p>
        </Link>
      </section>
    </div>
  );
}
