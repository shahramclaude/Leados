import { NextResponse } from "next/server";
import { db } from "@/db";
import { findRootCauses } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/root-cause?findingKey=X → RootCauseAnalysis
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const findingKey = searchParams.get("findingKey");
  if (!findingKey) {
    return NextResponse.json({ error: "findingKey query param is required" }, { status: 400 });
  }
  try {
    const analysis = await findRootCauses(findingKey, db);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("GET /api/knowledge/root-cause failed", error);
    return NextResponse.json({ error: "Finding not found or analysis failed" }, { status: 404 });
  }
}
