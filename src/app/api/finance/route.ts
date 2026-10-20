import { db } from "@/db";
import { financeLines } from "@/db/schema";
import { asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(financeLines).orderBy(asc(financeLines.month));
    return Response.json({ lines: rows });
  } catch {
    return Response.json({ error: "Failed to load finance lines", errorId: randomUUID() }, { status: 500 });
  }
}
