import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

// Orgs are the tenancy root and are bootstrapped directly rather than via
// the event log (see src/db/schema.ts header comment for rationale). This
// route is intentionally the only place a row is "just inserted" — every
// other mutable entity in LEADOS goes through the event-sourced repository
// layer in src/lib/platform/repositories.

export async function GET() {
  const rows = await db.select().from(schema.orgs).limit(200);
  return NextResponse.json({ ok: true, data: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : null;
  const slug = typeof body?.slug === "string" ? body.slug : null;
  if (!name || !slug) {
    return NextResponse.json({ ok: false, error: { code: "invalid", message: "name and slug are required" } }, { status: 400 });
  }

  const existing = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, slug)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ ok: false, error: { code: "conflict", message: `org with slug ${slug} already exists` } }, { status: 409 });
  }

  const [row] = await db.insert(schema.orgs).values({ id: randomUUID(), name, slug }).returning();
  return NextResponse.json({ ok: true, data: row }, { status: 201 });
}
