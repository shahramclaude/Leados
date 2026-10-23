import { db } from "@/db";
import { risks } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(risks).orderBy(desc(risks.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const [created] = await db
    .insert(risks)
    .values({
      title,
      category: body.category ?? "operational",
      likelihood: body.likelihood ?? "medium",
      impactLevel: body.impactLevel ?? "medium",
      owner: body.owner ?? "Unassigned",
      mitigation: body.mitigation ?? "",
      reviewDate: body.reviewDate ? new Date(body.reviewDate) : null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
