import { NextResponse } from "next/server";
import { db } from "@/db";
import { okrs as okrsTable } from "@/db/schema";
import { computeOkrHealth } from "@/lib/okr";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const rows = await db.select().from(okrsTable);
  const withHealth = rows.map((row) => ({ ...row, health: computeOkrHealth(row, now) }));
  return NextResponse.json({ okrs: withHealth });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { title, type, parentId, ownerId, targetValue, currentValue, unit, quarter } = body as Record<string, unknown>;

  if (!title || !type || !quarter) {
    return NextResponse.json({ error: "title, type, and quarter are required" }, { status: 400 });
  }
  if (type !== "objective" && type !== "key_result") {
    return NextResponse.json({ error: "type must be 'objective' or 'key_result'" }, { status: 400 });
  }

  const [created] = await db
    .insert(okrsTable)
    .values({
      title: String(title),
      type: String(type),
      parentId: parentId ? String(parentId) : null,
      ownerId: ownerId ? String(ownerId) : null,
      targetValue: targetValue !== undefined ? String(targetValue) : "100",
      currentValue: currentValue !== undefined ? String(currentValue) : "0",
      unit: unit ? String(unit) : "%",
      quarter: String(quarter),
    })
    .returning();

  return NextResponse.json({ okr: created }, { status: 201 });
}
