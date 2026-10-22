import { db } from "@/db";
import { tenants } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(tenants).orderBy(tenants.id);
  return Response.json({ tenants: rows });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: string; name?: string } | null;

  if (!body?.slug || !body?.name) {
    return Response.json({ error: "slug and name are required" }, { status: 400 });
  }

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: body.slug, name: body.name })
    .returning();

  return Response.json({ tenant }, { status: 201 });
}
