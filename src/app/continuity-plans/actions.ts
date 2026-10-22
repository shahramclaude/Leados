"use server";

import { revalidatePath } from "next/cache";
import { DRILL_SCENARIOS, startDrill, completeDrill } from "@/lib/continuity";

export async function runDrillAction(formData: FormData) {
  const scenarioKey = String(formData.get("scenarioKey") ?? "");
  const scenario = DRILL_SCENARIOS.find((s) => s.key === scenarioKey);
  if (!scenario) return;

  const drill = await startDrill(scenario.key, "resilience-lab scripted dry-run, platform-eng on-call, process owner");
  const startedAt = Date.now();

  await new Promise((resolve) => setTimeout(resolve, 800));

  const timerSeconds = Math.round((Date.now() - startedAt) / 1000);
  await completeDrill({
    drillId: drill.id,
    timerSeconds,
    afterActionNotes:
      `Dry-run of "${scenario.title}" via the continuity-plans UI. The workaround playbook was actionable as written. ` +
      "Flagged for a live human-facilitated run: communication channel if primary tools are also down, and an explicit " +
      "decision threshold for ending the workaround.",
    actionItems: [
      { owner: "Process owner", item: "Name a backup communication channel in the playbook.", dueInDays: 14 },
      { owner: "Resilience lab", item: "Schedule a live tabletop with real participants and timing.", dueInDays: 30 },
    ],
  });

  revalidatePath("/continuity-plans");
}
