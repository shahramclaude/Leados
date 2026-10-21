import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { slackInstalls } from "@/db/schema";
import { ApiError } from "./errors";

// ---------------------------------------------------------------------------
// Section C — reference inbound integration: Slack.
// Minimal scopes requested: `incoming-webhook`, `commands` (for a `/leados`
// slash command in a future part). OAuth client id/secret and the signing
// secret all come from env — never hardcoded, never in the repo. If
// SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_SIGNING_SECRET are unset the
// integration routes respond 503 rather than silently no-op, so a missing
// credential is loud in staging rather than a quiet prod surprise.
// ---------------------------------------------------------------------------

const REPLAY_WINDOW_SECONDS = 60 * 5;

export function requireSlackEnv() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!clientId || !clientSecret || !signingSecret) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Slack integration is not configured on this deployment (missing SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_SIGNING_SECRET).",
    );
  }
  return { clientId, clientSecret, signingSecret };
}

export function verifySlackRequest(signingSecret: string, timestampHeader: string | null, signatureHeader: string | null, rawBody: string) {
  if (!timestampHeader || !signatureHeader) {
    throw new ApiError("SIGNATURE_INVALID", "Missing Slack signature headers.");
  }
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError("SIGNATURE_INVALID", "Malformed X-Slack-Request-Timestamp header.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > REPLAY_WINDOW_SECONDS) {
    throw new ApiError("REPLAY_DETECTED", "Slack request timestamp is outside the replay window.");
  }
  const base = `v0:${timestampHeader}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new ApiError("SIGNATURE_INVALID", "Slack signature does not match.");
  }
}

export function slackOAuthAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "incoming-webhook,commands",
    redirect_uri: redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export interface SlackOAuthResponse {
  ok: boolean;
  access_token?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string };
  error?: string;
}

export async function exchangeSlackCode(clientId: string, clientSecret: string, code: string, redirectUri: string) {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const json = (await res.json()) as SlackOAuthResponse;
  if (!json.ok || !json.access_token || !json.team) {
    throw new ApiError("VALIDATION_ERROR", `Slack OAuth exchange failed: ${json.error ?? "unknown error"}`);
  }
  return json;
}

export async function persistSlackInstall(orgId: string, oauth: SlackOAuthResponse) {
  const [row] = await db
    .insert(slackInstalls)
    .values({
      orgId,
      teamId: oauth.team!.id,
      teamName: oauth.team!.name,
      accessToken: oauth.access_token!,
      botUserId: oauth.bot_user_id,
      incomingWebhookUrl: oauth.incoming_webhook?.url,
      incomingWebhookChannel: oauth.incoming_webhook?.channel,
    })
    .onConflictDoUpdate({
      target: slackInstalls.teamId,
      set: {
        accessToken: oauth.access_token!,
        incomingWebhookUrl: oauth.incoming_webhook?.url,
        incomingWebhookChannel: oauth.incoming_webhook?.channel,
      },
    })
    .returning();
  return row;
}

export async function getSlackInstallForOrg(orgId: string) {
  const [row] = await db.select().from(slackInstalls).where(eq(slackInstalls.orgId, orgId)).limit(1);
  return row ?? null;
}
