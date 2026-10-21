import { writeAudit } from "@/lib/api/audit";
import { getCorrelationId } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { toErrorResponse } from "@/lib/api/respond";
import { exchangeSlackCode, persistSlackInstall, requireSlackEnv } from "@/lib/api/slack";

// Slack redirects the browser here with `code` + the `state` minted by
// oauth/start. No bearer token is presented on this leg (it's a browser
// redirect), so org attribution comes from `state` — see the hardening note
// in oauth/start/route.ts.
export async function GET(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      throw new ApiError("VALIDATION_ERROR", "Missing `code` or `state` query parameter.");
    }
    const orgId = state.split(".")[0];
    const { clientId, clientSecret } = requireSlackEnv();
    const redirectUri = `${url.origin}/api/v1/integrations/slack/oauth/callback`;
    const oauth = await exchangeSlackCode(clientId, clientSecret, code, redirectUri);
    const install = await persistSlackInstall(orgId, oauth);
    await writeAudit({
      orgId,
      action: "slack.installed",
      resourceType: "slack_install",
      resourceId: install.id,
      metadata: { teamId: install.teamId, teamName: install.teamName },
      correlationId,
    });
    return Response.json(
      { ok: true, teamId: install.teamId, teamName: install.teamName },
      { status: 200, headers: { "X-Correlation-Id": correlationId } },
    );
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
