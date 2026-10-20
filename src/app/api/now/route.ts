// GET /api/now — refreshable payload for the decision-first cockpit. The
// server component on `/` renders the first paint; this endpoint lets the
// client re-pull the delta/decisions after a realtime event arrives without
// a full page reload. Visiting (GET) also stamps `lastVisitAt` for the *next*
// delta — identical semantics to the server-rendered page.

import { getCurrentUserId } from "@/lib/auth";
import { getNowSurface, markVisited } from "@/lib/now";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const surface = await getNowSurface(userId);
  const url = new URL(request.url);
  if (url.searchParams.get("stamp") !== "false") {
    await markVisited(userId);
  }
  return Response.json(surface);
}
