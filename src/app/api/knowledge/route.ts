import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { getOrCreateDemoTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = ["measured", "estimated", "association", "effect"];

export async function GET() {
  const tenant = await getOrCreateDemoTenant();
  const rows = await db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.tenantId, tenant.id))
    .orderBy(desc(knowledgeEntries.createdAt));

  return Response.json({ entries: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDemoTenant();
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || body.title.trim() === "") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const category = VALID_CATEGORIES.includes(body.category) ? body.category : "measured";
  const tags = Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string") : [];

  const [entry] = await db
    .insert(knowledgeEntries)
    .values({
      tenantId: tenant.id,
      title: body.title,
      body: typeof body.body === "string" ? body.body : "",
      category,
      tags,
    })
    .returning();

  return Response.json({ entry }, { status: 201 });
}
