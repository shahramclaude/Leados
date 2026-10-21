// E. Wargame studio — rival moves and market shocks become scenario branches
// (stored in `scenarios` with source='wargame') carrying probabilities that
// the strategic layer monitors via early-warning indicators.
import { db } from "@/db";
import { scenarios, wargameMoves } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listWargameScenarios() {
  const rows = await db.select().from(scenarios).where(eq(scenarios.source, "wargame"));
  const movesByScenario = await Promise.all(rows.map((s) => db.select().from(wargameMoves).where(eq(wargameMoves.scenarioId, s.id))));
  return rows.map((s, i) => ({ scenario: s, moves: movesByScenario[i].sort((a, b) => a.round - b.round) }));
}

export async function getWargameBranch(scenarioId: number) {
  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId));
  if (!scenario) return null;
  const moves = await db.select().from(wargameMoves).where(eq(wargameMoves.scenarioId, scenarioId));
  return { scenario, moves: moves.sort((a, b) => a.round - b.round) };
}
