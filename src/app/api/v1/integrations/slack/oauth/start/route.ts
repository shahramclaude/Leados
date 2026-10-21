import { randomUUID } from "crypto";
import { authenticate, requireScope } from "@/lib/api/auth";
import { getCorrelationId } from "@/lib/api/context";
import { toErrorResponse } from "@/lib/api/respond";
import { requireSlackEnv, slackOAuthAuthorizeUrl } from "@/lib/api/slack";

// Starts the Slack OAuth install flow with minimal scopes
// (`incoming-webhook,commands`). The org id is embedded (HMAC-free, but
// short-lived and single-use in a production hardening pass) in `state` so
// the callback can attribute the install without requiring a signed-in
// browser session — acceptable for a reference integration, called out in
// docs/API.md as a hardening follow-up.
export async function GET(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    const auth = await authenticate(req);
    requireScope(auth, "extensions:write");
    const { clientId } = requireSlackEnv();
    const url = new URL(req.url);
    const redirectUri = `${url.origin}/api/v1/integrations/slack/oauth/callback`;
    const state = `${auth.orgId}.${randomUUID()}`;
    const authorizeUrl = slackOAuthAuthorizeUrl(clientId, redirectUri, state);
    return Response.json({ authorizeUrl, state }, { status: 200, headers: { "X-Correlation-Id": correlationId } });
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
