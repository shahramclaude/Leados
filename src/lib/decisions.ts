// src/lib/decisions.ts
//
// Minimal Part 23 "decision register" stand-in.
//
// HONESTY / PROVENANCE NOTE: Part 23 (decision intelligence / decision log)
// is listed as a dependency of this part, but no `decisions` module exists
// anywhere in this sandbox's source tree. Rather than fabricate a decision
// workflow and present it as Part 23's actual implementation, this file
// provides only the narrow surface Part 29 needs (a referenceable decision
// record that findings/appetite-breaches can link to) against the
// `decisions` table in src/db/schema.ts. It should be treated as a
// placeholder/adapter, not as Part 23 itself, until Part 23's real module is
// reinstated in the repository.

import { db } from "@/db";
import { decisions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listDecisions() {
  return db.select().from(decisions);
}

export async function getDecision(id: number) {
  const [row] = await db.select().from(decisions).where(eq(decisions.id, id));
  return row ?? null;
}
