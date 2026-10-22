import { detectOverdueControlTests } from "@/lib/controls";
import { createFinding } from "@/lib/findings";
import { appendAuditEvent } from "@/lib/audit";
import { db } from "@/db";
import { riskControls, controls } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const overdue = await detectOverdueControlTests();
  const raised = [];
  for (const test of overdue) {
    const [rc] = await db.select().from(riskControls).where(eq(riskControls.id, test.riskControlId));
    const [ctrl] = rc ? await db.select().from(controls).where(eq(controls.id, rc.controlId)) : [null];
    await appendAuditEvent({
      category: "control_test",
      entityType: "control_test",
      entityId: String(test.id),
      action: "control_test_overdue",
      payload: { controlCode: ctrl?.code, scheduledFor: test.scheduledFor },
      actor: "control-deadline-sweep",
    });
    const finding = await createFinding({
      title: `Overdue control test: ${ctrl?.name ?? "unknown control"}`,
      severity: "high",
      sourceType: "control_overdue",
      sourceRef: String(test.id),
      description: `Control test scheduled for ${test.scheduledFor} was not executed and is now overdue.`,
    });
    raised.push({ controlTestId: test.id, findingCode: finding.code });
  }
  return Response.json({ overdueCount: overdue.length, findingsRaised: raised });
}
