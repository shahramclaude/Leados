// GET /api/now — JSON form of the Now surface, used by client-side refresh
// (e.g. after the realtime stream reports new events). The server-rendered
// `/` page uses the same `loadNowSurface` function directly for first paint.

import { resolveCurrentUser } from "@/lib/currentUser";
import { loadNowSurface } from "@/lib/nowSurface";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const data = await loadNowSurface(user.id, user.role);
  return Response.json(data);
}
