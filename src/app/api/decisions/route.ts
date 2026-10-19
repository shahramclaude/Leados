import { db } from "@/db";
import { decisions } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await ensureSeeded();
  const body = await request.json();

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const severity = typeof body.severity === "string" ? body.severity : "info";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : new Date();

  if (!title || !owner) {
    return Response.json({ error: "Title and owner are required." }, { status: 400 });
  }

  const [created] = await db
    .insert(decisions)
    .values({ title, owner, severity, description: description || "No additional context provided.", status: "pending", dueDate })
    .returning();

  return Response.json({ decision: created }, { status: 201 });
}
