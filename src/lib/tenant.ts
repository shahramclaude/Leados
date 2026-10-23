import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

// Single demo tenant bootstrap. The schema is already multi-tenant
// (tenant_id on every table) so adding real tenant switching later is a
// matter of wiring auth/session, not a schema change.

export const DEFAULT_TENANT_SLUG = "leados-demo";
export const DEFAULT_TENANT_NAME = "LEADOS Demo Organization";

export async function getOrCreateDefaultTenant() {
  const [existing] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(tenants)
    .values({ name: DEFAULT_TENANT_NAME, slug: DEFAULT_TENANT_SLUG })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [row] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEFAULT_TENANT_SLUG))
    .limit(1);

  return row;
}
