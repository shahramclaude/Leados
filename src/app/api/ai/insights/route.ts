// =============================================================================
// LEADOS — Part 11: Insight Synthesis API
// =============================================================================
// GET /api/ai/insights?orgId=1&userId=1&mode=analyst&start=...&end=...&stream=1
// =============================================================================

import { generateInsightSynthesis } from "@/lib/ai/insightSynthesis";
import { createPhaseStream, sseResponse } from "@/lib/ai/sse";
import type { NarrativeMode } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_DAYS = 400;

function parseParams(url: URL) {
  const orgId = Number(url.searchParams.get("orgId") ?? "1");
  const userIdParam = url.searchParams.get("userId");
  const userId = userIdParam ? Number(userIdParam) : null;
  const mode = (url.searchParams.get("mode") as NarrativeMode) ?? "analyst";
  const now = new Date();
  const end = url.searchParams.get("end") ? new Date(url.searchParams.get("end")!) : now;
  const start = url.searchParams.get("start")
    ? new Date(url.searchParams.get("start")!)
    : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const stream = url.searchParams.get("stream") === "1";
  return { orgId, userId, mode, start, end, stream };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { orgId, userId, mode, start, end, stream } = parseParams(url);

  if (!Number.isFinite(orgId)) {
    return Response.json({ error: "orgId is required" }, { status: 400 });
  }

  if (stream) {
    const body = createPhaseStream((onPhase) =>
      generateInsightSynthesis({ orgId, userId, timeframe: { start, end }, mode, onPhase }),
    );
    return sseResponse(body);
  }

  try {
    const result = await generateInsightSynthesis({ orgId, userId, timeframe: { start, end }, mode });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
