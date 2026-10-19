import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("playbooks", async (_req, requestId) => {
  await ensureBaselineData(db);
  const playbooks = await db.select().from(schema.playbooks);
  const instances = await db.select().from(schema.playbookInstances);
  return jsonOk({ playbooks, instances }, requestId);
});
