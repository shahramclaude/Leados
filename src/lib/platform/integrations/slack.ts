// Reference inbound/outbound integration: Slack notification bridge.
//
// This sits behind the same "actuation" boundary as webhooks — nothing ever
// calls Slack directly from a route handler. Credentials are read from env
// only (`SLACK_WEBHOOK_URL`), never stored in the repo or returned by any API
// response.
import { db } from "@/db";
import { slackNotifications } from "@/db/schema";
import { ApiError } from "../envelope";

export interface SlackNotifyInput {
  orgId: string;
  message: string;
  channelOverride?: string;
}

export async function sendSlackNotification(input: SlackNotifyInput) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    // No credential configured: record the intent so the integration is
    // still observable/testable end-to-end, but do not attempt a network
    // call. This keeps local/dev/CI green with zero secrets configured.
    const [row] = await db
      .insert(slackNotifications)
      .values({
        orgId: input.orgId,
        channelOverride: input.channelOverride ?? null,
        message: input.message,
        status: "skipped_no_credential",
      })
      .returning();
    return row;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.message,
        ...(input.channelOverride ? { channel: input.channelOverride } : {}),
      }),
    });

    const [row] = await db
      .insert(slackNotifications)
      .values({
        orgId: input.orgId,
        channelOverride: input.channelOverride ?? null,
        message: input.message,
        status: res.ok ? "sent" : "failed",
        responseStatus: res.status,
      })
      .returning();

    if (!res.ok) {
      throw new ApiError("INTERNAL_ERROR", `Slack responded with ${res.status}`);
    }

    return row;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("INTERNAL_ERROR", "Failed to reach Slack", {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}
