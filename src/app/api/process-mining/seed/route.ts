// POST /api/process-mining/seed
// Generates deterministic demo event logs (benchmark_flow + lead_to_close)
// and writes them into process_events, plus a declared ProcessDefinition for
// benchmark_flow and a small aggregate-safe roster. Safe to call repeatedly —
// event ids are stable so re-seeding is a no-op (onConflictDoNothing).
import { generateBenchmarkWorld, generateLeadToCloseWorld } from "@/lib/processMining/simulate";
import { insertEvents, upsertDeclaredDefinition, upsertRoster } from "@/lib/processMining/repo";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const benchmark = generateBenchmarkWorld();
    const leadToClose = generateLeadToCloseWorld();

    const insertedBenchmark = await insertEvents(benchmark.events);
    const insertedLeadToClose = await insertEvents(leadToClose);
    await upsertDeclaredDefinition(benchmark.definition);
    await upsertRoster([
      { resourceId: "intake-bot", displayName: "Intake Bot", team: "automation" },
      { resourceId: "agent-a", displayName: "Agent A", team: "triage" },
      { resourceId: "agent-b", displayName: "Agent B", team: "triage" },
      { resourceId: "agent-c", displayName: "Agent C", team: "triage" },
      { resourceId: "reviewer-x", displayName: "Reviewer X", team: "review" },
      { resourceId: "reviewer-y", displayName: "Reviewer Y", team: "review" },
      { resourceId: "approver-solo", displayName: "Approver (sole)", team: "approval" },
      { resourceId: "fulfil-a", displayName: "Fulfilment A", team: "fulfilment" },
      { resourceId: "fulfil-b", displayName: "Fulfilment B", team: "fulfilment" },
      { resourceId: "fulfil-c", displayName: "Fulfilment C", team: "fulfilment" },
      { resourceId: "fulfil-d", displayName: "Fulfilment D", team: "fulfilment" },
      { resourceId: "ae-dana", displayName: "AE Dana", team: "sales" },
      { resourceId: "ae-evan", displayName: "AE Evan", team: "sales" },
      { resourceId: "sdr-amy", displayName: "SDR Amy", team: "sales-dev" },
      { resourceId: "sdr-ben", displayName: "SDR Ben", team: "sales-dev" },
      { resourceId: "sdr-cleo", displayName: "SDR Cleo", team: "sales-dev" },
    ]);

    return Response.json({
      ok: true,
      inserted: {
        benchmark_flow: insertedBenchmark,
        lead_to_close: insertedLeadToClose,
      },
      note: "Synthetic demo data — discovered process maps built from this data describe what this generated log contains, not a real designed process.",
    });
  } catch (error) {
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
