import { NextResponse } from "next/server";
import {
  listTimeline,
  recallOnThisDay,
  recallThisQuarter,
  recordRetrospective,
  reinforceRetrospective,
  memorySummaryByCategory,
  findSimilarRetrospectives,
  type RetrospectiveInput,
} from "@/lib/institutionalMemory";

export const dynamic = "force-dynamic";

// GET /api/memory?view=timeline|on-this-day|this-quarter|summary
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "timeline";

  if (view === "on-this-day") return NextResponse.json({ records: await recallOnThisDay() });
  if (view === "this-quarter") return NextResponse.json({ records: await recallThisQuarter() });
  if (view === "summary") return NextResponse.json({ summary: await memorySummaryByCategory() });

  const limit = Number(searchParams.get("limit") ?? "100");
  const timeline = await listTimeline(limit);
  return NextResponse.json({ records: timeline });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RetrospectiveInput & { action?: string; id?: number; reason?: string; citedBy?: string };
  if (body.action === "reinforce" && body.id) {
    const row = await reinforceRetrospective(body.id, body.reason, body.citedBy);
    return NextResponse.json(row);
  }
  if (body.action === "find-similar") {
    const matches = await findSimilarRetrospectives(body);
    return NextResponse.json({ matches });
  }
  if (!body.title || !body.situation || !body.decision || !body.outcome || !body.lesson || !body.occurredAt) {
    return NextResponse.json(
      { error: "title, situation, decision, outcome, lesson and occurredAt are required" },
      { status: 400 }
    );
  }
  const row = await recordRetrospective(body);
  return NextResponse.json(row, { status: 201 });
}
