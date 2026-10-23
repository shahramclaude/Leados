import { db } from "@/db";
import { leaderStates } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leaderStates).orderBy(desc(leaderStates.recordedAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const leaderName = typeof body.leaderName === "string" ? body.leaderName.trim() : "";
  if (!leaderName) return Response.json({ error: "leaderName is required" }, { status: 400 });

  const [created] = await db
    .insert(leaderStates)
    .values({
      leaderName,
      role: body.role ?? "",
      decisionLoad: Number.isFinite(body.decisionLoad) ? body.decisionLoad : 50,
      stressIndex: Number.isFinite(body.stressIndex) ? body.stressIndex : 50,
      focusScore: Number.isFinite(body.focusScore) ? body.focusScore : 50,
      notes: body.notes ?? "",
    })
    .returning();

  return Response.json(created, { status: 201 });
}
