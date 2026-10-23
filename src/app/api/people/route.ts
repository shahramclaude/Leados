import { NextResponse } from "next/server";
import { db } from "@/db";
import { people } from "@/db/schema";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(people).orderBy(asc(people.name));
  return NextResponse.json({ people: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const [created] = await db
    .insert(people)
    .values({
      name: body.name.trim(),
      role: typeof body.role === "string" ? body.role.trim() : "",
      department: typeof body.department === "string" && body.department.trim() ? body.department.trim() : "General",
      email: typeof body.email === "string" ? body.email.trim() : "",
    })
    .returning();

  return NextResponse.json({ person: created }, { status: 201 });
}
