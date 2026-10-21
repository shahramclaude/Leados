import { getCorrelationId } from "@/lib/api/context";
import { toErrorResponse } from "@/lib/api/respond";
import { requireSlackEnv, verifySlackRequest } from "@/lib/api/slack";
import { emitEvent } from "@/lib/api/stream";
import { db } from "@/db";
import { slackInstalls } from "@/db/schema";
import { eq } from "drizzle-orm";

// Inbound Slack Events API webhook. Verifies `X-Slack-Signature` /
// `X-Slack-Request-Timestamp` (HMAC-SHA256 over `v0:<timestamp>:<rawBody>`)
// with a 5-minute replay window, then answers Slack's one-time
// `url_verification` handshake, or otherwise republishes the Slack event
// onto the org's realtime stream so it can drive notifications/approvals.
export async function POST(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    const { signingSecret } = requireSlackEnv();
    const rawBody = await req.text();
    verifySlackRequest(
      signingSecret,
      req.headers.get("x-slack-request-timestamp"),
      req.headers.get("x-slack-signature"),
      rawBody,
    );

    const payload = JSON.parse(rawBody) as { type?: string; challenge?: string; team_id?: string; event?: unknown };

    if (payload.type === "url_verification") {
      return Response.json({ challenge: payload.challenge }, { headers: { "X-Correlation-Id": correlationId } });
    }

    if (payload.team_id) {
      const [install] = await db.select().from(slackInstalls).where(eq(slackInstalls.teamId, payload.team_id)).limit(1);
      if (install) {
        await emitEvent(install.orgId, "slack.event.received", payload.event ?? payload, correlationId);
      }
    }

    return Response.json({ ok: true }, { headers: { "X-Correlation-Id": correlationId } });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
