import { reviewDeadlineEscalation } from "@/lib/governance/boardCycle";
import { toErrorResponse } from "@/lib/governance/httpErrors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const now = body.now ? new Date(body.now) : new Date();
    const meeting = await reviewDeadlineEscalation(Number(id), now);
    return Response.json({ ok: true, meeting });
  } catch (err) {
    return toErrorResponse(err);
  }
}
