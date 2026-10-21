import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { appendAudit } from "@/lib/ops/auditChain";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler({ routeFamily: "audit" }, async (req) => {
  const url = new URL(req.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") || 100));
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.seq)).limit(limit);
  return Response.json({ entries: rows });
});

const BodySchema = z.object({ actor: z.string().default("demo"), action: z.string(), resource: z.string(), payload: z.record(z.string(), z.unknown()).optional() });

export const POST = withApiHandler({ routeFamily: "audit" }, async (req) => {
  const body = BodySchema.parse(await req.json());
  const row = await appendAudit(body.actor, body.action, body.resource, body.payload ?? {});
  return Response.json({ entry: row }, { status: 201 });
});
