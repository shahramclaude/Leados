import { NextRequest, NextResponse } from "next/server";
import { badRequest, requireUserId } from "@/app/api/adaptation/_util";
import { getQuestionnaire, saveQuestionnaire, skipQuestionnaire } from "@/lib/state/profileStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = requireUserId(req);
  if (!userId) return badRequest("userId is required");
  const existing = await getQuestionnaire(userId);
  return NextResponse.json({ ok: true, answers: existing });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.userId !== "string") return badRequest("userId is required");

  if (body.skipped === true) {
    await skipQuestionnaire(body.userId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { detailVsSummary, visualVsTabular, deliberativeVsQuick } = body.answers ?? {};
  if ([detailVsSummary, visualVsTabular, deliberativeVsQuick].some((v) => typeof v !== "number")) {
    return badRequest("answers.detailVsSummary, visualVsTabular, deliberativeVsQuick must be numbers between -1 and 1");
  }

  const style = await saveQuestionnaire(body.userId, { detailVsSummary, visualVsTabular, deliberativeVsQuick });
  return NextResponse.json({ ok: true, style });
}
