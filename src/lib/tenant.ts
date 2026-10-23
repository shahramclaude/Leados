import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEMO_TENANT_SLUG = "leados-demo";

/**
 * Returns the single demo tenant, creating it on first use. This mirrors the
 * "single demo tenant auto-created on first use" behaviour described for the
 * LEADOS founding build, scoped to what this session actually implements:
 * every table carries tenant_id, but there is no auth/RLS boundary yet.
 */
export async function getOrCreateDemoTenant() {
  const existing = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_TENANT_SLUG))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await db
    .insert(tenants)
    .values({ slug: DEMO_TENANT_SLUG, name: "LEADOS Demo Tenant" })
    .onConflictDoNothing({ target: tenants.slug })
    .returning();

  if (inserted.length > 0) {
    return inserted[0];
  }

  // Lost a race with another request creating the same tenant concurrently.
  const retry = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_TENANT_SLUG))
    .limit(1);

  return retry[0];
}
