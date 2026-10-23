import { composeAndSendComms, legalReviewComms, sendComms, CrisisServiceError } from "@/lib/crisis/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  try {
    if (body.action === "legal_review") {
      const updated = await legalReviewComms(body.messageId, body.approve, body.note ?? "", body.legalPersonaId);
      return Response.json({ message: updated });
    }

    if (body.action === "send") {
      const updated = await sendComms(body.messageId, body.actingRoleKeys ?? []);
      return Response.json({ message: updated });
    }

    const message = await composeAndSendComms({
      crisisId: id,
      groupKey: body.groupKey,
      subject: body.subject,
      body: body.body,
      actingRoleKeys: body.actingRoleKeys ?? [],
      actorPersonaId: body.actorPersonaId,
    });
    return Response.json({ message });
  } catch (err) {
    if (err instanceof CrisisServiceError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
