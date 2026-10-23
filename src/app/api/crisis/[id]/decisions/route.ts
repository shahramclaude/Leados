import { recordDecision, CrisisServiceError } from "@/lib/crisis/service";
import type { RoleKey } from "@/lib/crisis/stateMachine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  try {
    const result = await recordDecision({
      crisisId: id,
      title: body.title,
      rationale: body.rationale ?? "",
      decidedByRoleKey: body.decidedByRoleKey as RoleKey,
      decidedByPersonaId: body.decidedByPersonaId,
      decideByHoursFromNow: Number(body.decideByHoursFromNow ?? 2),
      assumptions: body.assumptions ?? [],
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof CrisisServiceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
