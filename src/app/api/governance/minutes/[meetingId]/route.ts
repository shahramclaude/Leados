import {
  getOrCreateMinutes,
  addVerbatimExcerpt,
  setGeneratedSummary,
  finalizeMinutes,
  getMinutes,
} from "@/lib/governance/minutes";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess, can } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "minutes_public_summary", "read");
    const { meetingId } = await params;
    const record = await getMinutes(Number(meetingId));
    const canSeeFull = can(actor.boardTier, "minutes_full", "read");
    if (!record) return Response.json({ ok: true, minutes: null });
    if (canSeeFull) return Response.json({ ok: true, minutes: record });
    // Lower tiers only ever see the generated summary once finalized, never
    // unfinalized verbatim excerpts.
    return Response.json({
      ok: true,
      minutes: record.finalized
        ? { id: record.id, meetingId: record.meetingId, generatedSummary: record.generatedSummary, finalized: true }
        : null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "minutes_full", "write");
    const { meetingId } = await params;
    const body = await request.json();

    if (body.action === "ensure") {
      const record = await getOrCreateMinutes(Number(meetingId));
      return Response.json({ ok: true, minutes: record });
    }
    if (body.action === "add_verbatim") {
      const record = await addVerbatimExcerpt(Number(meetingId), body.excerpt);
      return Response.json({ ok: true, minutes: record });
    }
    if (body.action === "set_summary") {
      const record = await setGeneratedSummary(Number(meetingId), body.summary);
      return Response.json({ ok: true, minutes: record });
    }
    if (body.action === "finalize") {
      const record = await finalizeMinutes({
        meetingId: Number(meetingId),
        finalizedBy: actor.id,
        finalizedByTier: actor.boardTier,
      });
      return Response.json({ ok: true, minutes: record });
    }
    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
