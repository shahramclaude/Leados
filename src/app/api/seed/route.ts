import { db } from "@/db";
import {
  leados_people,
  leados_events,
  leados_decisions,
  leados_growth_plans,
  leados_work_queue,
  leados_hypotheses,
  leados_audit,
} from "@/db/schema";
import { seed } from "@/db/seed";
import { logAudit } from "@/lib/leados/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Reset: wipe all LeadOS tables, then reseed from scratch.
    await db.delete(leados_events);
    await db.delete(leados_growth_plans);
    await db.delete(leados_decisions);
    await db.delete(leados_work_queue);
    await db.delete(leados_hypotheses);
    await db.delete(leados_audit);
    await db.delete(leados_people);

    await seed();
    await logAudit("RESEED", "Database reset and reseeded on demand.");
    return Response.json({ ok: true });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "reseed failed" }, { status: 500 });
  }
}
