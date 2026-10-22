// LEADOS — Part 35 resilience lab: local risk register.
//
// Stand-in for Part 29's risk register, which is not present in this
// repository snapshot. Structured so a future merge just re-points the
// `domainKey` foreign reference at Part 29's real tables. Chaos run outcomes
// flow into this register: an "untested" assumption becomes "tested_holds"
// (chaos confirmed the protection works) or "tested_broken" (chaos found a
// real gap — which must then spawn a hardening task, see resilience.ts).

import { db } from "@/db";
import { riskRegisterEntries } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function updateRiskBelief(opts: {
  domainKey: string;
  title: string;
  belief: "untested" | "tested_holds" | "tested_broken";
  sourceExperimentKey: string;
}) {
  const existing = await db
    .select()
    .from(riskRegisterEntries)
    .where(eq(riskRegisterEntries.title, opts.title));

  if (existing.length === 0) {
    await db.insert(riskRegisterEntries).values({
      domainKey: opts.domainKey,
      title: opts.title,
      description: `Belief tracked via chaos experiment ${opts.sourceExperimentKey}.`,
      belief: opts.belief,
      owner: "resilience-lab",
      sourceExperimentKey: opts.sourceExperimentKey,
    });
    return;
  }

  await db
    .update(riskRegisterEntries)
    .set({
      belief: opts.belief,
      sourceExperimentKey: opts.sourceExperimentKey,
      lastUpdated: new Date(),
    })
    .where(eq(riskRegisterEntries.title, opts.title));
}

export async function listRiskRegister() {
  return db.select().from(riskRegisterEntries).orderBy(riskRegisterEntries.domainKey);
}
