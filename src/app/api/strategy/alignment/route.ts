import {
  cascadeCompletenessFor,
  detectCapacityConflicts,
  linkIntegrityFindings,
} from "@/lib/strategy/alignmentEngine";
import { listEvidenceRefs, listKeyResults, listObjectiveLinks, listObjectives } from "@/lib/strategy/objectives";
import { listInitiatives, listTeams } from "@/lib/strategy/initiatives";

export const dynamic = "force-dynamic";

export async function GET() {
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
  const cascade = objectives.map((o) => cascadeCompletenessFor(o, keyResults, initiatives, evidence));
  const cascadeFindings = cascade.flatMap((c) => c.findings);

  return Response.json({
    findings: [...integrityFindings, ...capacityFindings, ...cascadeFindings],
    cascadeCompleteness: cascade,
    summary: {
      objectiveCount: objectives.length,
      linkCount: links.length,
      criticalFindingCount: [...integrityFindings, ...capacityFindings, ...cascadeFindings].filter(
        (f) => f.severity === "critical",
      ).length,
    },
  });
}
