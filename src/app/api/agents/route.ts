import { db } from "@/db";
import { agents } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(agents).orderBy(desc(agents.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const [created] = await db
    .insert(agents)
    .values({
      name,
      kernelType: body.kernelType ?? "sensing",
      description: body.description ?? "",
      autonomyLevel: body.autonomyLevel ?? "supervised",
    })
    .returning();

  return Response.json(created, { status: 201 });
}
