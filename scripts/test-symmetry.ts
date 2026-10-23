// Phase 3(d)/4(3): symmetry (parity) test. Builds the matrix of everything a
// manager can see about a direct report and confirms every item is also
// visible in the person's own equivalent view — i.e. manager view ⊆ person's
// own view ∪ explicit, named policy extensions (people.ts).
import "./_env";
import { db } from "@/db";
import { growthGoals } from "@/db/schema";
import { managerVisibleItems, personOwnEquivalentItems } from "@/lib/managerEnablement";
import { eq } from "drizzle-orm";

export async function run(): Promise<boolean> {
  console.log("=== test:symmetry — manager view ⊆ person's own view ===");
  let ok = true;

  const managerId = "person_mgr_a";
  const personId = "person_a1";

  const managerItems = await managerVisibleItems(managerId, personId);
  const personItems = await personOwnEquivalentItems(personId);
  const personKeys = new Set(personItems.map((i) => `${i.sourceTable}:${i.sourceId}`));

  console.log(`Manager-visible items (${managerItems.length}):`);
  for (const item of managerItems) {
    const key = `${item.sourceTable}:${item.sourceId}`;
    const visibleToPerson = personKeys.has(key);
    console.log(`  [${item.surface}] ${item.summary} — visible to person: ${visibleToPerson}`);
    if (!visibleToPerson) {
      console.error(`FAIL: manager can see "${item.summary}" (${key}) but the person's own view does not include it.`);
      ok = false;
    }
  }

  // Negative control: the private (not shared) goal must NOT appear in the
  // manager's view at all.
  const privateGoals = await db
    .select()
    .from(growthGoals)
    .where(eq(growthGoals.personId, personId));
  const privateGoal = privateGoals.find((g) => g.visibility === "private");
  if (privateGoal) {
    const leaked = managerItems.some((i) => i.sourceId === privateGoal.id);
    if (leaked) {
      console.error(`FAIL: private goal "${privateGoal.title}" leaked into manager view.`);
      ok = false;
    } else {
      console.log(`PASS: private goal "${privateGoal.title}" correctly absent from manager view.`);
    }
  }

  console.log(ok ? "RESULT: PASS (symmetry holds)" : "RESULT: FAIL");
  return ok;
}

if (require.main === module) {
  run()
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
