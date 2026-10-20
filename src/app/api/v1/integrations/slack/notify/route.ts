import { SlackNotifySchema } from "@/lib/openapi/schemas";
import { ApiError } from "@/lib/platform/envelope";
import { withApiV1 } from "@/lib/platform/handler";
import { sendSlackNotification } from "@/lib/platform/integrations/slack";

export const dynamic = "force-dynamic";

export const POST = withApiV1("write", async (req, ctx) => {
  const json = await req.json().catch(() => null);
  const parsed = SlackNotifySchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid Slack notification payload", parsed.error.flatten());
  }

  const row = await sendSlackNotification({
    orgId: ctx.orgId,
    message: parsed.data.message,
    channelOverride: parsed.data.channelOverride,
  });

  return Response.json({ id: row.id, status: row.status }, { status: 202 });
});
