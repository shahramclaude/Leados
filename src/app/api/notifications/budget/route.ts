// LEADOS Part 14 — GET /api/notifications/budget
// Visible spend for the interrupt-budget gate: "6 of 8 used today".
import { resolveActor } from "@/lib/demoContext";
import { getBudgetStatus } from "@/lib/cognitiveLoad";
import { checkQuietHours } from "@/lib/circadian";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  const status = await getBudgetStatus(actor.userId, actor.timezone);
  const quiet = await checkQuietHours(actor.userId);
  return Response.json({ ...status, quietHours: quiet });
}
