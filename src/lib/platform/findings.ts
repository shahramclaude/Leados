import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { emitEvent } from "./events";
import { decodeCursor, encodeCursor, type CursorPage } from "./pagination";

export interface CreateFindingInput {
  decisionId?: string;
  summary: string;
  severity?: "info" | "warning" | "critical";
}

export async function createFinding(orgId: string, input: CreateFindingInput) {
  const [row] = await db
    .insert(findings)
    .values({
      orgId,
      decisionId: input.decisionId ?? null,
      summary: input.summary,
      severity: input.severity ?? "info",
    })
    .returning();

  await emitEvent(orgId, "finding.created", { findingId: row.id, severity: row.severity });
  return row;
}

export async function listFindings(orgId: string, opts: { limit: number; cursor?: string | null }) {
  const cursor: CursorPage | null = opts.cursor ? decodeCursor(opts.cursor) : null;

  const rows = await db
    .select()
    .from(findings)
    .where(
      cursor
        ? and(
            eq(findings.orgId, orgId),
            or(
              lt(findings.createdAt, cursor.createdAt),
              and(eq(findings.createdAt, cursor.createdAt), lt(findings.id, cursor.id)),
            ),
          )
        : eq(findings.orgId, orgId),
    )
    .orderBy(desc(findings.createdAt), desc(findings.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const nextCursor = hasMore
    ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })
    : null;

  return { items: page, nextCursor };
}
