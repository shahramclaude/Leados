import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { metrics, metricValues } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const defs = await db.select().from(metrics);
  const withLatest = await Promise.all(
    defs.map(async (m) => {
      const [latest] = await db
        .select()
        .from(metricValues)
        .where(eq(metricValues.metricKey, m.key))
        .orderBy(desc(metricValues.recordedAt))
        .limit(1);
      return { ...m, latest: latest ?? null };
    })
  );
  return NextResponse.json({ metrics: withLatest });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { key: string; label: string; unit?: string; value: number };
  if (!body.key || !body.label || typeof body.value !== "number") {
    return NextResponse.json({ error: "key, label and numeric value are required" }, { status: 400 });
  }
  await db.insert(metrics).values({ key: body.key, label: body.label, unit: body.unit ?? null }).onConflictDoNothing({ target: metrics.key });
  const [row] = await db.insert(metricValues).values({ metricKey: body.key, value: body.value }).returning();
  return NextResponse.json(row, { status: 201 });
}
