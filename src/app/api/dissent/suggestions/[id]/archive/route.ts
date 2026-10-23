import { requestArchive, approveArchive } from "@/lib/dissent";
import { actorFromHeaders, DISSENT_ARCHIVE_ROLES } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Legitimate archive workflow: step 1 request, step 2 a DIFFERENT eligible
// person approves (reusing the dual-control engine). Pass `actionId` to
// approve an existing request instead of creating a new one.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = actorFromHeaders(req.headers);
  const body = await req.json().catch(() => ({}));

  if (!actor.personId || !actor.role || !DISSENT_ARCHIVE_ROLES.includes(actor.role)) {
    return Response.json({ error: "Not authorized to request/approve suggestion archival." }, { status: 403 });
  }

  try {
    if (body.actionId) {
      const result = await approveArchive({ actionId: Number(body.actionId), approverPersonId: actor.personId, approverRole: actor.role });
      const status = result.status === "blocked" ? 403 : 200;
      return Response.json(result, { status });
    }

    const action = await requestArchive({
      suggestionId: Number(id),
      requestedByPersonId: actor.personId,
      requestedByRole: actor.role,
      reason: body.reason ?? "Resolved — archiving per workflow.",
    });
    return Response.json({ action }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
