// Part 08 — GET: version history of persisted board packs for a given month.

import { NextRequest } from "next/server";
import { db } from "@/db";
import { financeBoardPacks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month) return Response.json({ error: "month query param (YYYY-MM) is required" }, { status: 400 });
  const rows = await db
    .select()
    .from(financeBoardPacks)
    .where(eq(financeBoardPacks.month, month))
    .orderBy(desc(financeBoardPacks.version));
  return Response.json({ month, packs: rows });
}
