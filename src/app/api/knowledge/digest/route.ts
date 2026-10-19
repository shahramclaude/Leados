import { NextResponse } from "next/server";
import { db } from "@/db";
import { buildInstitutionalMemoryDigest } from "@/lib/knowledgeGraph";

export const dynamic = "force-dynamic";

// GET /api/knowledge/digest → InstitutionalMemoryDigest
export async function GET() {
  try {
    const digest = await buildInstitutionalMemoryDigest(db);
    return NextResponse.json(digest);
  } catch (error) {
    console.error("GET /api/knowledge/digest failed", error);
    return NextResponse.json({ error: "Failed to build institutional memory digest" }, { status: 500 });
  }
}
