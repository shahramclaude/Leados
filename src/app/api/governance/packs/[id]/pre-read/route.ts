import {
  recordPackOpened,
  recordPackAcknowledged,
  aggregatePreReadMetric,
} from "@/lib/governance/preRead";
import { resolveActor, unauthorized } from "@/lib/governance/actor";
import { assertAccess } from "@/lib/governance/access";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "governance_metrics_aggregate", "read");
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const expected = Number(searchParams.get("expectedReaderCount") ?? "0");
    const metric = await aggregatePreReadMetric(Number(id), expected);
    return Response.json({ ok: true, metric });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await resolveActor(request);
    if (!actor) return unauthorized();
    assertAccess(actor.boardTier, "board_pack_full", "read");
    const { id } = await params;
    const body = await request.json();
    if (body.action === "open") {
      const row = await recordPackOpened(Number(id), actor.id);
      return Response.json({ ok: true, row });
    }
    if (body.action === "acknowledge") {
      const row = await recordPackAcknowledged(
        Number(id),
        actor.id,
        body.timeSpentSeconds ?? 0,
      );
      return Response.json({ ok: true, row });
    }
    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
