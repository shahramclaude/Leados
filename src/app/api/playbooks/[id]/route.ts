import { getPlaybook, getPlaybookVersionHistory, listRunsForPlaybook } from "@/lib/playbooks";
import { computePlaybookEffectiveness, effectivenessBadge } from "@/lib/playbooksIntelligence";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const playbook = await getPlaybook(id);
  if (!playbook) return Response.json({ ok: false, error: "Not found" }, { status: 404 });

  const [versions, runs, effectiveness] = await Promise.all([
    getPlaybookVersionHistory(playbook.slug),
    listRunsForPlaybook(id),
    computePlaybookEffectiveness(id),
  ]);

  return Response.json({
    ok: true,
    playbook,
    versions,
    runs,
    effectiveness,
    badge: effectivenessBadge(effectiveness),
  });
}
