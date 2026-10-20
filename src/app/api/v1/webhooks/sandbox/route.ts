// Sandbox receiver for testing outbound webhook delivery end-to-end: point a
// subscription's URL at this endpoint (it needs the subscription secret to
// verify, which you only know if you created the subscription), and it will
// verify the HMAC signature and echo back the result. No auth required since
// this *is* the thing being authenticated (via HMAC, not a bearer token).
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/platform/webhookVerify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-leados-signature");
  const timestamp = req.headers.get("x-leados-timestamp");
  const deliveryId = req.headers.get("x-leados-delivery");

  if (!signatureHeader || !timestamp) {
    return Response.json({ verified: false, reason: "missing signature headers" }, { status: 400 });
  }

  let event: { orgId?: string } = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    // leave event empty; verification will likely fail anyway
  }

  let verified = false;
  if (event.orgId) {
    const subs = await db
      .select()
      .from(webhookSubscriptions)
      .where(and(eq(webhookSubscriptions.orgId, event.orgId), eq(webhookSubscriptions.active, true)));

    verified = subs.some((sub) =>
      verifyWebhookSignature({ secret: sub.secret, timestamp, rawBody, signatureHeader }),
    );
  }

  console.log(`[webhook-sandbox] delivery=${deliveryId} verified=${verified}`);

  return Response.json({ verified, deliveryId, receivedAt: new Date().toISOString() });
}
