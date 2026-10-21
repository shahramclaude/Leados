import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { desc } from "drizzle-orm";
import { generateBoardPack } from "@/lib/boardPack";

export const dynamic = "force-dynamic";

export async function GET() {
  const [latest] = await db.select().from(boardPacks).orderBy(desc(boardPacks.generatedAt)).limit(1);
  if (!latest) {
    const pack = await generateBoardPack(new Date().toISOString().slice(0, 10));
    return Response.json({ pack, generated: true });
  }
  return Response.json({ pack: latest, generated: false });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const periodLabel = body.periodLabel ?? new Date().toISOString().slice(0, 10);
  const pack = await generateBoardPack(periodLabel);
  return Response.json({ pack }, { status: 201 });
}
