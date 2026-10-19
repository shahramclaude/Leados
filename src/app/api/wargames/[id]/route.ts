import { db } from "@/db";
import { wargames } from "@/db/schema";
import { eq } from "drizzle-orm";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wargameId = Number(id);
  if (!Number.isFinite(wargameId)) return jsonError("Invalid wargame id");
  const [row] = await db.select().from(wargames).where(eq(wargames.id, wargameId)).limit(1);
  if (!row) return jsonError("Wargame not found", 404);
  return Response.json(row);
}
