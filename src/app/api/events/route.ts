import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { publishEvent } from "@/lib/ops/eventBus";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "events" }, async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") || 50));
  const rows = await db.select().from(eventLog).orderBy(desc(eventLog.seq)).limit(limit);
  return Response.json({ events: rows });
});

const BodySchema = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  actor: z.string().default("demo"),
  notify: z.array(z.string()).optional(),
});

export const POST = withApiHandler({ routeFamily: "events" }, async (req) => {
  const body = BodySchema.parse(await req.json());
  const row = await publishEvent(body.eventType, body.payload, { actor: body.actor, notify: body.notify });
  return Response.json({ event: row }, { status: 201 });
});
