import { findDrift } from "@/lib/strategy/driftRadar";
import { listEvidenceRefs, listKeyResults, listObjectives } from "@/lib/strategy/objectives";

export const dynamic = "force-dynamic";

export async function GET() {
  const [objectives, keyResults] = await Promise.all([listObjectives(), listKeyResults()]);
  const evidence = await listEvidenceRefs();

  const findings = findDrift(objectives, keyResults, evidence);

  return Response.json({
    findings,
    summary: {
      critical: findings.filter((f) => f.severity === "critical").length,
      warning: findings.filter((f) => f.severity === "warning").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
  });
}
