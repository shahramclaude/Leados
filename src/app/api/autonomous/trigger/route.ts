import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

// Client-facing trigger. The browser's autonomous-runner poller (layout)
// calls this route with no secret required (same-origin, same trust
// boundary as every other mutating route in this app). This route performs
// the server-to-server call to the secret-gated /api/autonomous/run route,
// attaching CRON_SECRET from process.env — satisfying that route's auth
// check without ever exposing the secret to client code.
export async function POST(request: Request): Promise<Response> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1));
  const enabled = rows.length > 0 ? rows[0].autonomousEnabled : true;
  if (!enabled) {
    return jsonError("autonomous runner is disabled in settings", 409);
  }

  const origin = new URL(request.url).origin;
  const secret = process.env.CRON_SECRET;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const response = await fetch(`${origin}/api/autonomous/run`, { method: "POST", headers });
  const data: unknown = await response.json();
  return Response.json(data, { status: response.status });
}
