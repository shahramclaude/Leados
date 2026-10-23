import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { getOrCreateDefaultTenant } from "@/lib/tenant";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const rows = await db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.tenantId, tenant.id))
    .orderBy(desc(knowledgeEntries.updatedAt));

  return Response.json({ entries: rows });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) return Response.json({ error: "tenant unavailable" }, { status: 500 });

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    content?: string;
    tags?: string[];
    source?: string;
    confidenceLabel?: "measured" | "estimated" | "association" | "effect";
  };

  if (!body.title || !body.content) {
    return Response.json({ error: "title and content are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(knowledgeEntries)
    .values({
      tenantId: tenant.id,
      title: body.title,
      category: body.category ?? "general",
      content: body.content,
      tags: body.tags ?? [],
      source: body.source ?? "manual",
      confidenceLabel: body.confidenceLabel ?? "measured",
    })
    .returning();

  return Response.json({ entry: created }, { status: 201 });
}
