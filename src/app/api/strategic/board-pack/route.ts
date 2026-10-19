import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { jsonError } from "@/lib/api";
import { buildBoardPack } from "@/lib/boardPackService";

export const dynamic = "force-dynamic";

// GET generates a fresh board pack from current data, persists it, and
// returns it. GET ?history=1 instead returns previously generated packs.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("history") === "1") {
      const rows = await db.select().from(boardPacks).orderBy(desc(boardPacks.generatedAt)).limit(20);
      return Response.json(rows);
    }
    const { pack, inputsSnapshot, periodLabel } = await buildBoardPack(new Date());
    const [saved] = await db.insert(boardPacks).values({ periodLabel, markdown: pack.markdown, inputsSnapshot }).returning();
    return Response.json({ pack, boardPackId: saved.id, generatedAt: saved.generatedAt });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}

export async function POST() {
  return GET(new Request("http://internal/strategic/board-pack"));
}
