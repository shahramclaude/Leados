import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  try {
    const rows = status
      ? await db.select().from(decisions).where(eq(decisions.status, status)).orderBy(desc(decisions.createdAt))
      : await db.select().from(decisions).orderBy(desc(decisions.createdAt));
    return Response.json({ decisions: rows });
  } catch {
    return Response.json({ error: "Failed to load decisions", errorId: randomUUID() }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = `d-${randomUUID().slice(0, 8)}`;
    const [row] = await db
      .insert(decisions)
      .values({
        id,
        title: body.title,
        summary: body.summary,
        owner: body.owner,
        status: "pending",
        severity: Number(body.severity) || 3,
        dueDate: body.dueDate,
      })
      .returning();
    return Response.json({ decision: row }, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to create decision", errorId: randomUUID() }, { status: 500 });
  }
}
