import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { decisions } from "@/db/schema";
import { ApiError } from "./envelope";
import { emitEvent } from "./events";
import { decodeCursor, encodeCursor, type CursorPage } from "./pagination";

export interface CreateDecisionInput {
  title: string;
  status?: "open" | "decided" | "deferred" | "abandoned";
  owner?: string;
  description?: string;
}

export async function createDecision(orgId: string, input: CreateDecisionInput) {
  const [row] = await db
    .insert(decisions)
    .values({
      orgId,
      title: input.title,
      status: input.status ?? "open",
      owner: input.owner ?? null,
      description: input.description ?? null,
    })
    .returning();

  await emitEvent(orgId, "decision.created", { decisionId: row.id, title: row.title });
  return row;
}

export async function updateDecision(orgId: string, id: string, input: Partial<CreateDecisionInput>) {
  const existing = await getDecision(orgId, id);
  const [row] = await db
    .update(decisions)
    .set({
      title: input.title ?? existing.title,
      status: input.status ?? existing.status,
      owner: input.owner ?? existing.owner,
      description: input.description ?? existing.description,
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, id))
    .returning();

  await emitEvent(orgId, "decision.updated", { decisionId: row.id });
  return row;
}

export async function deleteDecision(orgId: string, id: string) {
  await getDecision(orgId, id);
  await db.delete(decisions).where(and(eq(decisions.orgId, orgId), eq(decisions.id, id)));
}

export async function getDecision(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.orgId, orgId), eq(decisions.id, id)))
    .limit(1);
  if (!row) throw new ApiError("NOT_FOUND", `Decision ${id} not found`);
  return row;
}

export async function listDecisions(orgId: string, opts: { limit: number; cursor?: string | null }) {
  const cursor: CursorPage | null = opts.cursor ? decodeCursor(opts.cursor) : null;

  const rows = await db
    .select()
    .from(decisions)
    .where(
      cursor
        ? and(
            eq(decisions.orgId, orgId),
            or(
              lt(decisions.createdAt, cursor.createdAt),
              and(eq(decisions.createdAt, cursor.createdAt), lt(decisions.id, cursor.id)),
            ),
          )
        : eq(decisions.orgId, orgId),
    )
    .orderBy(desc(decisions.createdAt), desc(decisions.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const nextCursor = hasMore
    ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })
    : null;

  return { items: page, nextCursor };
}
