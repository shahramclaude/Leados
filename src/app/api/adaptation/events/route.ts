import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/app/api/adaptation/_util";
import { recordInteractionEvent } from "@/lib/state/profileStore";
import { DOMAINS, type Domain } from "@/lib/familiarity";
import type { InteractionEventType } from "@/lib/aiLearning";

export const dynamic = "force-dynamic";

const VALID_EVENT_TYPES: InteractionEventType[] = [
  "drilldown",
  "vocabulary_use",
  "time_on_detail",
  "time_on_summary",
  "expand_detail",
  "collapse_detail",
  "switch_to_table",
  "switch_to_chart",
  "quick_decision",
  "deliberate_review",
  "question_select",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string") return badRequest("userId is required");
  if (!DOMAINS.includes(body.domain)) return badRequest("domain must be one of finance|people|risk|tech");
  if (!VALID_EVENT_TYPES.includes(body.eventType)) return badRequest(`eventType must be one of ${VALID_EVENT_TYPES.join(", ")}`);

  const magnitude = typeof body.magnitude === "number" ? body.magnitude : 0.6;

  await recordInteractionEvent(body.userId, body.domain as Domain, body.eventType as InteractionEventType, magnitude, body.metadata);

  return NextResponse.json({ ok: true });
}
