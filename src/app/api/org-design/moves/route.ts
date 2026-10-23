import { db } from "@/db";
import { structuralMoves } from "@/db/schema";
import { runStructuralSimulation } from "@/lib/org-design/dbHelpers";
import type { MovePayload } from "@/lib/org-design/twinEngine";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const moves = await db.select().from(structuralMoves).orderBy(desc(structuralMoves.createdAt));
  return Response.json({ moves });
}

export async function POST(req: Request) {
  const body = await req.json();
  const move = body.move as MovePayload;
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : `${move.type} simulation`;
  const description = typeof body.description === "string" ? body.description : `${move.type} structural move`;
  const createdBy = typeof body.createdBy === "string" ? body.createdBy : "org-design-lab";

  if (!move || !move.type) {
    return Response.json({ ok: false, error: "A move payload with a `type` field is required." }, { status: 400 });
  }

  try {
    const result = await runStructuralSimulation({ move, label, createdBy, description });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
