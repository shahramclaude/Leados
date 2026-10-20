import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { savedSearches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(savedSearches).orderBy(desc(savedSearches.createdAt));
  return NextResponse.json({ savedSearches: rows });
}
