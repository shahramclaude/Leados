// Part 26 reconstruction: a minimal change-initiative reference so a growth
// goal can optionally be tagged against an org change wave (e.g. "this
// stretch assignment supports the Q3 platform migration"). Not present to
// read in this sandbox (src/lib was empty); reconstructed minimally — Part
// 43 only needs the read side of this model, not the full change engine.

import { db } from "@/db";
import { changeInitiatives } from "@/db/schema";

export type ChangeInitiative = typeof changeInitiatives.$inferSelect;
export type ChangePhase = "sense" | "design" | "pilot" | "scale" | "sustain";

export async function listChangeInitiatives(): Promise<ChangeInitiative[]> {
  return db.select().from(changeInitiatives);
}
