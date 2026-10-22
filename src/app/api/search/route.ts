import { NextRequest } from "next/server";
import { search } from "@/lib/synthesis";
import { db } from "@/db";
import { savedSearches } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const facetType = searchParams.get("facetType") ?? undefined;
  const seedEntityId = searchParams.get("seedEntityId") ?? undefined;
  const listSaved = searchParams.get("saved") === "true";

  if (listSaved) {
    const rows = await db.select().from(savedSearches).orderBy(sql`${savedSearches.createdAt} desc`);
    return Response.json({ ok: true, savedSearches: rows });
  }

  if (!q) return Response.json({ ok: false, error: "q is required" }, { status: 400 });

  try {
    const results = await search(q, { facetType, seedEntityId, limit: 20 });
    return Response.json({ ok: true, query: q, facetType, seedEntityId, results });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // Save a search (CommandPalette "save this search")
  try {
    const body = await req.json();
    if (!body.name || !body.queryText || !body.createdBy) {
      return Response.json({ ok: false, error: "name, queryText, and createdBy are required" }, { status: 400 });
    }
    const [row] = await db
      .insert(savedSearches)
      .values({
        name: body.name,
        queryText: body.queryText,
        filters: body.filters ?? {},
        createdBy: body.createdBy,
      })
      .returning();
    return Response.json({ ok: true, savedSearch: row }, { status: 201 });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
