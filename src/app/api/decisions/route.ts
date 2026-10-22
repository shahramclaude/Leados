import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { getTenantBySlug, resolveTenantSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = await resolveTenantSlug(request);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: `unknown tenant '${slug}'` }, { status: 404 });

  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.tenantId, tenant.id))
    .orderBy(desc(decisions.createdAt))
    .limit(50);

  return Response.json({ tenant: tenant.slug, decisions: rows });
}
