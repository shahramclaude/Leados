import { transitionCrisis, markCommanderCompromised, CrisisServiceError } from "@/lib/crisis/service";
import type { CrisisState, RoleKey } from "@/lib/crisis/stateMachine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  try {
    if (body.markCommanderCompromised) {
      const updated = await markCommanderCompromised(id, body.note ?? "Reported via Crisis Room.");
      return Response.json({ crisis: updated });
    }

    const updated = await transitionCrisis({
      crisisId: id,
      toState: body.toState as CrisisState,
      actorPersonaId: body.actorPersonaId,
      actorRoleKeys: (body.actorRoleKeys ?? []) as RoleKey[],
      reason: body.reason ?? "",
    });
    return Response.json({ crisis: updated });
  } catch (err) {
    if (err instanceof CrisisServiceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
