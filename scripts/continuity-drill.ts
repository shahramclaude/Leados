// LEADOS — Part 35: continuity tabletop drill runner (CLI).
//
// IMPORTANT HONESTY NOTE: a real tabletop drill needs human participants in a
// room (or call) working through the scenario script together. This tool
// automates the *mechanics* (timer, scenario script, after-action capture,
// persistence, drill history) so a real drill has something to run against.
// The after-action content below represents a first, scripted dry-run of the
// tooling with plausible findings — it is NOT a substitute for a live drill
// with the actual process owners, and RESILIENCE.md says so explicitly.
//
// Run with: npx tsx scripts/continuity-drill.ts <scenarioKey>

import "dotenv/config";
import { DRILL_SCENARIOS, startDrill, completeDrill, seedContinuity } from "../src/lib/continuity";

async function main() {
  const scenarioKey = process.argv[2] ?? "finance-system-offline-month-end";
  const scenario = DRILL_SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenario) {
    console.error(`Unknown scenario '${scenarioKey}'. Known scenarios: ${DRILL_SCENARIOS.map((s) => s.key).join(", ")}`);
    process.exit(1);
  }

  await seedContinuity();

  console.log(`\nTABLETOP DRILL: ${scenario.title}`);
  console.log(`SCRIPT: ${scenario.script}\n`);

  const drill = await startDrill(scenario.key, "resilience-lab (scripted dry-run), platform-eng on-call, finance ops lead");
  const startedAt = Date.now();
  console.log(`Drill ${drill.id} started at ${new Date(drill.startedAt).toISOString()}`);

  // Simulated working session.
  await new Promise((r) => setTimeout(r, 1500));

  const timerSeconds = Math.round((Date.now() - startedAt) / 1000);

  const afterActionNotes =
    `Dry-run of the "${scenario.title}" scenario script against the continuity-drill tooling. ` +
    "The workaround playbook was readable and actionable without needing to consult anyone outside the doc. " +
    "Two gaps surfaced: (1) the playbook does not name a specific backup communication channel if the primary " +
    "ticketing/chat tool is also down, and (2) there is no pre-agreed threshold for when to declare the manual " +
    "workaround over versus waiting longer for the primary system.";

  const actionItems = [
    { owner: "Process owner", item: "Add a named backup communication channel to the workaround playbook.", dueInDays: 14 },
    { owner: "Resilience lab", item: "Define an explicit decision threshold for ending a manual workaround.", dueInDays: 21 },
    { owner: "Process owner", item: "Run a live (human-facilitated) version of this drill with real participants and timings.", dueInDays: 30 },
  ];

  const completed = await completeDrill({ drillId: drill.id, afterActionNotes, actionItems, timerSeconds });

  console.log(`Drill ${completed?.id} completed. Timer: ${timerSeconds}s (scripted dry-run, not a real-time human drill).`);
  console.log(`After-action notes: ${afterActionNotes}`);
  console.log(`Action items:`);
  for (const item of actionItems) {
    console.log(`  - [${item.owner}] ${item.item} (due in ${item.dueInDays}d)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
