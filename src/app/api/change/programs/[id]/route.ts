import { getProgram, listGroups, listInterventions } from "@/lib/change/repository";
import { getProgramFunnel, getProgramMomentum, getGroupReadiness } from "@/lib/change/dashboard";
import { changeLoadIndex } from "@/lib/change/changeLoad";
import { listPrograms } from "@/lib/change/repository";

export const dynamic = "force-dynamic";

/**
 * Transformation Dashboard detail payload for one change program: funnel
 * (with per-group k-anonymity gating), momentum, resistance map (qualitative,
 * not metric-derived), per-group change-load, and linked interventions.
 *
 * No field in this payload is traceable to an individual: funnel/momentum
 * values are either a gated aggregate or an explicit suppression marker.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const program = await getProgram(id);
  if (!program) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const now = new Date();
  const [funnel, momentum, interventions, allGroups, allPrograms] = await Promise.all([
    getProgramFunnel(id, now),
    getProgramMomentum(id, now),
    listInterventions(id),
    listGroups(),
    listPrograms(),
  ]);

  const groupBreakdown = await Promise.all(
    program.affectedGroups.map(async (groupId) => {
      const groupRow = allGroups.find((g) => g.id === groupId);
      const load = changeLoadIndex(groupId, allPrograms, now);
      if (!groupRow) return { groupId, load };
      const readiness = await getGroupReadiness(groupRow, allPrograms, now);
      return { groupId, groupName: groupRow.name, load, readiness: readiness.readiness };
    })
  );

  return Response.json({
    ok: true,
    program,
    funnel,
    momentum,
    resistanceMap: program.resistanceMap,
    groupBreakdown,
    interventions,
  });
}
