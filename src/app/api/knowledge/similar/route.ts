import { NextResponse } from "next/server";
import { db } from "@/db";
import { findSimilarPastPatterns, getFindingByKey } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/similar?findingKey=X&lookbackDays=365 → PatternMatch[]
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const findingKey = searchParams.get("findingKey");
  const lookbackDays = Number(searchParams.get("lookbackDays") ?? "365") || 365;
  if (!findingKey) {
    return NextResponse.json({ error: "findingKey query param is required" }, { status: 400 });
  }
  try {
    const finding = await getFindingByKey(db, findingKey);
    if (!finding) {
      return NextResponse.json({ error: `No finding with key "${findingKey}"` }, { status: 404 });
    }
    const matches = await findSimilarPastPatterns(finding, db, lookbackDays);
    return NextResponse.json(matches);
  } catch (error) {
    console.error("GET /api/knowledge/similar failed", error);
    return NextResponse.json({ error: "Failed to compute similar patterns" }, { status: 500 });
  }
}
