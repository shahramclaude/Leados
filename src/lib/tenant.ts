// Minimal tenant resolution helper.
//
// LEADOS v0.1.0 isolates data by `tenant_id` foreign keys (see src/db/schema.ts)
// and resolves the active tenant from a `tenant` query parameter or the
// `x-leados-tenant` header, defaulting to the "demo" tenant seeded by
// scripts/seed.ts. There is no authentication or per-user RBAC yet — every
// request that can name a tenant slug can read/write that tenant's data. This
// is explicitly called out as a gap in docs/explanations/architecture.md and
// SECURITY posture notes in README.md; it is not hidden.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";

export const DEFAULT_TENANT_SLUG = "demo";

export async function resolveTenantSlug(request: Request): Promise<string> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("tenant");
  const fromHeader = request.headers.get("x-leados-tenant");
  return fromQuery ?? fromHeader ?? DEFAULT_TENANT_SLUG;
}

export async function getTenantBySlug(slug: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return tenant ?? null;
}
