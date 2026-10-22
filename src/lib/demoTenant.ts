/**
 * src/lib/demoTenant.ts
 * This Part 18 slice focuses on performance, not auth — Part 03 upstream
 * owns session auth/tenant resolution. Routes here resolve the single
 * seeded demo tenant so the performance work (indexes, caching, pagination,
 * backpressure) can be exercised and measured end-to-end. See Phase 5
 * self-review: "what did the load test NOT model" for the explicit callout
 * that this is not a substitute for Part 03's auth enforcement.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";

let cachedTenantId: string | null = null;

export async function resolveDemoTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;
  const rows = await db.select({ id: tenants.id }).from(tenants).orderBy(sql`${tenants.createdAt} asc`).limit(1);
  if (!rows[0]) {
    throw new Error("no tenant seeded — run `npm run db:seed` first");
  }
  cachedTenantId = rows[0].id;
  return cachedTenantId;
}
