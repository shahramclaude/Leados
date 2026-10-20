import { NextResponse } from "next/server";
import { recordStructuredEvent, type StructuredRelationEvent } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

/**
 * Structured-event intake for the knowledge graph. Only allow-listed event
 * `type`s (see EVENT_TYPE_TO_RELATION in knowledgeGraph.ts) ever produce a
 * graph edge — this is the "extracted explicitly from structured events,
 * never from private content" rule enforced in code, not just in docs.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as StructuredRelationEvent;
  if (!body.type || !body.payload?.fromKey || !body.payload?.toKey) {
    return NextResponse.json({ error: "type, payload.fromKey and payload.toKey are required" }, { status: 400 });
  }
  try {
    const result = await recordStructuredEvent(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
