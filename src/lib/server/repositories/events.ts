// Server-only repository. Imported by API routes and Server Components —
// never by client code (enforced by convention + the "use server only" note
// below; see docs/FRONTEND.md "Server/client boundary").
import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

export interface EventFilters {
  domain?: string;
  limit?: number;
  offset?: number;
}

export async function listEvents(filters: EventFilters = {}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const where = filters.domain ? eq(events.domain, filters.domain) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(events).where(where),
  ]);

  return { rows, total: count };
}

export async function createEvent(input: {
  type: string;
  domain: string;
  severity: number;
  title: string;
  body?: string;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const [row] = await db
    .insert(events)
    .values({
      type: input.type,
      domain: input.domain,
      severity: input.severity,
      title: input.title,
      body: input.body ?? "",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })
    .returning();
  return row;
}
