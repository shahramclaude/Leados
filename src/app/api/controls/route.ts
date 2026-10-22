import { db } from "@/db";
import { controls, riskControls, controlTests, risks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { betaMean, betaCredibleInterval, evidenceStrengthLabel } from "@/lib/beta";
import { computeComplianceStatus } from "@/lib/complianceStatus";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctrlRows = await db.select().from(controls);
  const out = [];
  for (const c of ctrlRows) {
    const links = await db
      .select({
        riskControlId: riskControls.id,
        riskId: riskControls.riskId,
        riskCode: risks.code,
        riskTitle: risks.title,
        effectiveness: riskControls.effectiveness,
        lastTestedAt: riskControls.lastTestedAt,
        nextTestDueAt: riskControls.nextTestDueAt,
      })
      .from(riskControls)
      .innerJoin(risks, eq(riskControls.riskId, risks.id))
      .where(eq(riskControls.controlId, c.id));

    const linkDetails = [];
    for (const l of links) {
      const [latestTest] = await db
        .select()
        .from(controlTests)
        .where(eq(controlTests.riskControlId, l.riskControlId))
        .orderBy(desc(controlTests.createdAt))
        .limit(1);

      const status = computeComplianceStatus({
        dueAt: latestTest ? new Date(latestTest.scheduledFor) : new Date(l.nextTestDueAt),
        executedAt: latestTest?.executedAt ? new Date(latestTest.executedAt) : null,
        result: (latestTest?.result as "pass" | "fail" | null) ?? null,
        evidenceAuditEventId: latestTest?.evidenceAuditEventId ?? null,
      });

      linkDetails.push({
        riskControlId: l.riskControlId,
        riskId: l.riskId,
        riskCode: l.riskCode,
        riskTitle: l.riskTitle,
        effectivenessMean: betaMean(l.effectiveness),
        effectivenessInterval90: betaCredibleInterval(l.effectiveness, 0.9),
        evidenceStrength: evidenceStrengthLabel(l.effectiveness),
        lastTestedAt: l.lastTestedAt,
        nextTestDueAt: l.nextTestDueAt,
        latestTest: latestTest ?? null,
        status,
      });
    }

    out.push({ control: c, links: linkDetails });
  }

  return Response.json({ controls: out });
}
