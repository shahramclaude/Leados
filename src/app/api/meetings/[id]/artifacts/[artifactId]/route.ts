import { confirmArtifact, GatedConfirmationRequiredError, rejectArtifact } from "@/lib/meeting/pipeline";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const { artifactId } = await params;
  const body = await request.json().catch(() => ({}));
  const action: string | undefined = body.action;

  if (action === "reject") {
    const by: string = body.by ?? "unknown";
    const updated = await rejectArtifact(artifactId, by);
    return Response.json({ artifact: updated });
  }

  if (action === "confirm") {
    try {
      const updated = await confirmArtifact(artifactId, {
        confirmedBy: body.by ?? "unknown",
        edits: body.edits,
        acknowledgeGated: Boolean(body.acknowledgeGated),
      });
      return Response.json({ artifact: updated });
    } catch (err) {
      if (err instanceof GatedConfirmationRequiredError) {
        return Response.json(
          { error: "gated_confirmation_required", tier: err.tier, message: err.message },
          { status: 409 },
        );
      }
      return Response.json({ error: "confirm_failed" }, { status: 400 });
    }
  }

  return Response.json({ error: "unknown_action" }, { status: 400 });
}
