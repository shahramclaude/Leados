// LEADOS — Part 56: model cards (Part 11 stand-in).
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { modelCards } from "@/db/schema";

export async function getModelCardsForSystem(systemKey: string) {
  return db
    .select()
    .from(modelCards)
    .where(eq(modelCards.systemKey, systemKey))
    .orderBy(desc(modelCards.createdAt));
}

export async function getLatestModelCard(systemKey: string) {
  const cards = await getModelCardsForSystem(systemKey);
  return cards[0];
}
