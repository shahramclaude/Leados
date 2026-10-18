import { db } from "@/db";
import { leadosFindings, leadosPlaybooks, leadosPlaybookRuns } from "@/db/schema";
import { matchPlaybook, computePlaybookEffectiveness } from "@/lib/playbooksEngine";
import { ensureSeeded } from "@/lib/seedOrgData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();

    const [findings, playbooks, runs] = await Promise.all([
      db.select().from(leadosFindings),
      db.select().from(leadosPlaybooks),
      db.select().from(leadosPlaybookRuns),
    ]);

    const matches = matchPlaybook(findings, playbooks);
    const stats = computePlaybookEffectiveness(runs, playbooks);

    return Response.json({ playbooks, matches, stats });
  } catch (err) {
    console.error("GET /api/playbooks failed", err);
    return Response.json({ error: "Failed to load playbooks" }, { status: 500 });
  }
}
