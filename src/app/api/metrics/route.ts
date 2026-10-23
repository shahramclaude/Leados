import { NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { metrics } from "@/db/schema";
import { createMetricSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(metrics).orderBy(asc(metrics.createdAt));
  return Response.json({ metrics: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createMetricSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.select().from(metrics).where(eq(metrics.key, parsed.data.key)).limit(1);
  if (existing.length > 0) {
    return Response.json({ error: "duplicate_key" }, { status: 409 });
  }

  const [row] = await db.insert(metrics).values(parsed.data).returning();
  return Response.json({ metric: row }, { status: 201 });
}
