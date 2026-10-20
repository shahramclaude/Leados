import { NextResponse } from "next/server";
import { search } from "@/lib/search";
import { db } from "@/db";
import { savedSearches } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

// GET /api/search?q=qa+gate&types=retrospective,playbook&tags=payments&limit=20
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const types = searchParams.get("types")?.split(",").filter(Boolean);
  const tags = searchParams.get("tags")?.split(",").filter(Boolean);
  const limit = Number(searchParams.get("limit") ?? "20");
  const result = await search({ query: q, sourceTypes: types, tags, limit });
  return NextResponse.json(result);
}

// POST /api/search  { name, query, filters } -> saves a search
export async function POST(request: Request) {
  const body = (await request.json()) as { name: string; query: string; filters?: Record<string, unknown>; createdBy?: string };
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const [row] = await db
    .insert(savedSearches)
    .values({ name: body.name, query: body.query ?? "", filters: body.filters ?? {}, createdBy: body.createdBy ?? "anonymous" })
    .returning();
  return NextResponse.json(row, { status: 201 });
}


