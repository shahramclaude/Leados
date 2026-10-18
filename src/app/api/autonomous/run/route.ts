import { runAutonomousPass } from "@/lib/autonomous";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

// This is the "official" cron-facing endpoint. When CRON_SECRET is
// configured in the environment, callers must present it as a bearer token.
// The in-app autonomous runner never calls this endpoint directly from the
// browser (secrets must stay server-side) — instead the browser polls
// /api/autonomous/trigger, which is a server route that forwards to this
// one with the secret attached server-side. This keeps CRON_SECRET out of
// the client bundle while still gating this endpoint for external callers
// (e.g. a real cron provider hitting it directly).
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return jsonError("unauthorized", 401);
    }
  }
  const summary = await runAutonomousPass();
  return Response.json(summary);
}
