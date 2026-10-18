import { db } from "@/db";
import { leados_metrics } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_metrics);

  const latest: Record<string, { value: number; createdAt: string; domain: string; note: string | null }> = {};
  rows
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .forEach((r) => {
      latest[r.key] = {
        value: r.value,
        createdAt: r.createdAt.toISOString(),
        domain: r.domain,
        note: r.note,
      };
    });

  return Response.json(latest);
}

export async function POST(req: Request) {
  const body = await req.json();
  const value = Number(body?.value);

  if (!body?.key || typeof body.key !== "string") {
    return Response.json({ error: "key is required" }, { status: 400 });
  }
  if (!Number.isFinite(value)) {
    return Response.json({ error: "value must be a finite number" }, { status: 400 });
  }

  const [row] = await db
    .insert(leados_metrics)
    .values({
      key: body.key,
      value,
      domain: body.domain ?? "ops",
      note: body.note ?? "",
    })
    .returning();

  return Response.json(row, { status: 201 });
}
