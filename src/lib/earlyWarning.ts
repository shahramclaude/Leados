// src/lib/earlyWarning.ts
//
// Minimal Part 13 "early-warning indicator" stand-in.
//
// HONESTY / PROVENANCE NOTE: Part 13 is listed in the broader LEADOS plan as
// the source of early-warning indicators (EWIs), but no such module exists
// in this sandbox. This file is a narrow placeholder/adapter exposing just
// enough (`listIndicators`, `getIndicator`) for risks to link to an EWI id
// and for the Risk Register UI to render current indicator levels. It is
// NOT a reimplementation of Part 13's actual indicator-detection logic.

import { db } from "@/db";
import { earlyWarningIndicators } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listIndicators() {
  return db.select().from(earlyWarningIndicators);
}

export async function getIndicatorByCode(code: string) {
  const [row] = await db.select().from(earlyWarningIndicators).where(eq(earlyWarningIndicators.code, code));
  return row ?? null;
}

export async function createIndicator(input: {
  code: string;
  name: string;
  description: string;
  currentLevel?: "normal" | "elevated" | "critical";
}) {
  const [row] = await db
    .insert(earlyWarningIndicators)
    .values({ ...input, currentLevel: input.currentLevel ?? "normal" })
    .returning();
  return row;
}
