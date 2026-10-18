import { db } from "@/db";
import { leadosMetricDefinitions } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leadosMetricDefinitions).orderBy(asc(leadosMetricDefinitions.key));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!body?.key || typeof body.key !== "string") {
    return Response.json({ error: "key is required" }, { status: 400 });
  }
  if (!body?.displayName || typeof body.displayName !== "string") {
    return Response.json({ error: "displayName is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(leadosMetricDefinitions)
    .values({
      key: body.key,
      displayName: body.displayName,
      domain: body.domain ?? "general",
      unit: body.unit ?? null,
      description: body.description ?? "",
      formula: body.formula ?? null,
      target: body.target != null ? Number(body.target) : null,
      benchmark: body.benchmark != null ? Number(body.benchmark) : null,
      benchmarkSource: body.benchmarkSource ?? null,
      isLeading: Boolean(body.isLeading),
      isLagging: Boolean(body.isLagging),
      tags: Array.isArray(body.tags) ? body.tags : null,
    })
    .onConflictDoUpdate({
      target: leadosMetricDefinitions.key,
      set: {
        displayName: body.displayName,
        domain: body.domain ?? "general",
        unit: body.unit ?? null,
        description: body.description ?? "",
        formula: body.formula ?? null,
        target: body.target != null ? Number(body.target) : null,
        benchmark: body.benchmark != null ? Number(body.benchmark) : null,
        benchmarkSource: body.benchmarkSource ?? null,
        isLeading: Boolean(body.isLeading),
        isLagging: Boolean(body.isLagging),
        tags: Array.isArray(body.tags) ? body.tags : null,
      },
    })
    .returning();

  return Response.json(row, { status: 201 });
}
