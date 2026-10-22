import { db } from "@/db";
import { strategyBriefs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives, listTeams } from "@/lib/strategy/initiatives";
import { cascadeCompletenessFor, detectCapacityConflicts, linkIntegrityFindings } from "@/lib/strategy/alignmentEngine";
import { findDrift } from "@/lib/strategy/driftRadar";
import { GenerateBriefButton } from "../_components/GenerateBriefButton";

export const dynamic = "force-dynamic";

export default async function ReviewCadencePage() {
  const [objectives, links, keyResults, initiatives, teams] = await Promise.all([
    listObjectives(),
    listObjectiveLinks(),
    listKeyResults(),
    listInitiatives(),
    listTeams(),
  ]);
  const evidence = await listEvidenceRefs();
  const briefs = await db.select().from(strategyBriefs).orderBy(desc(strategyBriefs.generatedAt)).limit(8);

  const blocked = initiatives.filter((i) => i.status === "blocked");
  const integrityFindings = linkIntegrityFindings(objectives, links);
  const capacityFindings = detectCapacityConflicts(initiatives, teams);
  const cascadeFindings = objectives.flatMap((o) => cascadeCompletenessFor(o, keyResults, initiatives, evidence).findings);
  const driftFindings = findDrift(objectives, keyResults, evidence);
  const criticalFindings = [...integrityFindings, ...capacityFindings, ...cascadeFindings, ...driftFindings].filter(
    (f) => f.severity === "critical",
  );

  const checkInPrompts = [
    ...blocked.map((i) => `What's blocking "${i.title}"${i.blockerNote ? ` (noted: ${i.blockerNote})` : ""}, and what's needed to unblock it this week?`),
    ...criticalFindings
      .filter((f) => f.kind === "progress_drift")
      .map((f) => `${f.summary}. Which number is right — the dashboard or the evidence?`),
    ...criticalFindings
      .filter((f) => f.kind === "cascade_no_key_results")
      .map((f) => `${f.summary}. Should this objective get key results this week, or be archived?`),
    ...criticalFindings
      .filter((f) => f.kind === "capacity_conflict")
      .map((f) => `${f.summary}. Which initiative should yield capacity first?`),
  ];

  const monthlyPack = briefs.slice(0, 4);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Review Cadence</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Weekly check-in prompts generated from real deltas (blockers, drift, cascade gaps, capacity conflicts) — not
          generic questions. The monthly pack auto-assembles the last few weekly briefs.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">This week's check-in prompts</h2>
          <GenerateBriefButton />
        </div>
        {checkInPrompts.length === 0 ? (
          <p className="text-sm text-slate-500">
            No urgent prompts right now — no blockers, no critical drift, no cascade gaps, no capacity conflicts.
          </p>
        ) : (
          <ul className="space-y-2">
            {checkInPrompts.map((prompt, idx) => (
              <li key={idx} className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                {prompt}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Weekly strategy briefs</h2>
        {briefs.length === 0 ? (
          <p className="text-sm text-slate-500">No briefs generated yet. Click "Generate weekly brief" above.</p>
        ) : (
          <div className="space-y-4">
            {briefs.map((b) => (
              <article key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {new Date(b.periodStart).toLocaleDateString()} – {new Date(b.periodEnd).toLocaleDateString()}
                  </span>
                  <span>{b.citationCount} citations</span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800">{b.narrativeText}</pre>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Monthly strategy review pack (auto-assembled)</h2>
        <p className="text-sm text-slate-500">
          Rolls up the last {monthlyPack.length} weekly brief{monthlyPack.length === 1 ? "" : "s"} into a single pack.
          No numbers are invented here — the pack is a concatenation of already-generated, already-linted briefs.
        </p>
        {monthlyPack.length === 0 ? (
          <p className="text-sm text-slate-400">Not enough briefs yet to assemble a pack.</p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">
              Total citations across pack: {monthlyPack.reduce((s, b) => s + b.citationCount, 0)}
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {monthlyPack.map((b) => (
                <li key={b.id}>
                  {new Date(b.generatedAt).toLocaleDateString()} — {b.narrativeText.split("\n")[0]}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
