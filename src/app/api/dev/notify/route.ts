// POST /api/dev/notify — TEST/DEMO SUPPORT ONLY.
//
// Drives src/lib/notify.ts's createNotification from inside the running
// server process, so interrupt-policy, budget, dedupe, and adaptive-batching
// tests exercise the real code path (and the real in-process event bus) the
// same way a production finding/approval pipeline would. Same gating
// posture as /api/dev/seed-event — see that file's comment.

import { createNotification, type CreateNotificationInput } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.TEST_EVENTS_SECRET;
  if (secret && req.headers.get("x-test-secret") !== secret) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as CreateNotificationInput | null;
  if (!body?.userId || !body?.class || !body?.domain || !body?.title || !body?.dedupeKey) {
    return Response.json({ error: "userId, class, domain, title, dedupeKey are required" }, { status: 400 });
  }

  const result = await createNotification(body);
  return Response.json({ result });
}
