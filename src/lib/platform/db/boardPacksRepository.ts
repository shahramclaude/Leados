import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { desc } from "drizzle-orm";
import type { BoardPack, BoardPackSummary } from "@/lib/domain/types";

function toRecord(row: typeof boardPacks.$inferSelect): BoardPack {
  return {
    id: row.id,
    periodLabel: row.periodLabel,
    summary: row.summary as BoardPackSummary,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertBoardPack(input: {
  periodLabel: string;
  summary: BoardPackSummary;
}): Promise<BoardPack> {
  const [row] = await db
    .insert(boardPacks)
    .values({ periodLabel: input.periodLabel, summary: input.summary })
    .returning();
  return toRecord(row);
}

export async function getLatestBoardPack(): Promise<BoardPack | null> {
  const [row] = await db.select().from(boardPacks).orderBy(desc(boardPacks.id)).limit(1);
  return row ? toRecord(row) : null;
}

export async function truncateBoardPacks(): Promise<void> {
  await db.delete(boardPacks);
}
