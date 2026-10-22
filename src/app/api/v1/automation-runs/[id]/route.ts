import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { computeEtag, matchesIfNoneMatch } from "@/lib/api/etag";
import { ApiError } from "@/lib/api/errors";
import { toAutomationRun } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/** Poll endpoint: automation clients hit this until status is succeeded/failed. ETag avoids re-transfer when unchanged. */
export const GET = withApi("automation:read", async (req, { correlationId, rl, params }) => {
  try {
    const [row] = await db.select().from(automationRuns).where(eq(automationRuns.id, params.id)).limit(1);
    if (!row) throw new ApiError("NOT_FOUND", `No automation run with id ${params.id}`);
    const etag = computeEtag(row.id, row.updatedAt);
    if (matchesIfNoneMatch(req, etag)) return new Response(null, { status: 304, headers: baseHeaders(correlationId, { ETag: etag }) });
    return jsonOk(toAutomationRun(row), correlationId, { headers: { ETag: etag } }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
