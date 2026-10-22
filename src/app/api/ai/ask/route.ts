// =============================================================================
// LEADOS — Part 11: Ask-LEADOS API
// =============================================================================
// POST /api/ai/ask { orgId, userId, question, mode?, start?, end?, stream? }
//
// NOTE (bridge): see briefing/route.ts — orgId/userId are request-body fields
// here pending Part 01 session auth.
// =============================================================================

import { askLeados } from "@/lib/ai/askLeados";
import { createPhaseStream, sseResponse } from "@/lib/ai/sse";
import type { NarrativeMode } from "@/lib/ai/types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const DEFAULT_LOOKBACK_DAYS = 400;

const BodySchema = z.object({
  orgId: z.number().int().positive(),
  userId: z.number().int().positive().nullable().optional(),
  question: z.string().min(1).max(2000),
  mode: z.enum(["executive", "analyst"]).optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  stream: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { orgId, question, mode } = parsed.data;
  const userId = parsed.data.userId ?? null;
  const end = parsed.data.end ? new Date(parsed.data.end) : new Date();
  const start = parsed.data.start ? new Date(parsed.data.start) : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const devCostBadge = process.env.NODE_ENV !== "production";

  if (parsed.data.stream) {
    const body = createPhaseStream((onPhase) =>
      askLeados({ orgId, userId, question, timeframe: { start, end }, mode: mode as NarrativeMode | undefined, onPhase, devCostBadge }),
    );
    return sseResponse(body);
  }

  try {
    const result = await askLeados({ orgId, userId, question, timeframe: { start, end }, mode: mode as NarrativeMode | undefined, devCostBadge });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
