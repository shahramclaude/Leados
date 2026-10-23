// Whistleblower / audit-committee safe channel (Part 46 access rules,
// applied at board level). Reports are only ever visible to tiers listed in
// `allowedTiers` — by default chair + audit committee only, explicitly
// excluding "management" and general directors, since the whole point of
// the channel is to bypass management when necessary.

import crypto from "node:crypto";
import { db } from "@/db";
import { whistleblowerReports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";
import { assertAccess } from "./access";

export function generateReporterToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export async function submitReport(params: { subject: string; body: string }) {
  const reporterToken = generateReporterToken();
  const [row] = await db
    .insert(whistleblowerReports)
    .values({
      reporterToken,
      subject: params.subject,
      body: params.body,
    })
    .returning();

  // Audit entry intentionally omits the reporter token from payload to
  // avoid defeating anonymity via the audit trail itself.
  await appendAuditEntry({
    action: "whistleblower.report_submitted",
    entityType: "whistleblower_report",
    entityId: row.id,
    payload: { subject: params.subject },
  });

  return { reportId: row.id, reporterToken };
}

/** Access to the channel is tier-gated via access.ts AND re-checked against
 * the report's own `allowedTiers` list, which a given report can narrow
 * further (e.g. a report naming the audit committee chair themselves). */
export async function listReportsForTier(tier: string) {
  assertAccess(tier, "whistleblower_channel", "read");
  const rows = await db.select().from(whistleblowerReports);
  return rows.filter((r) => {
    const allowed = (r.allowedTiers as string[]) ?? [];
    return allowed.includes(tier);
  });
}

export async function updateReportStatus(params: {
  reportId: number;
  tier: string;
  status: "under_review" | "escalated_to_board" | "closed";
}) {
  assertAccess(params.tier, "whistleblower_channel", "write");
  const [row] = await db
    .update(whistleblowerReports)
    .set({ status: params.status, lastUpdatedAt: new Date() })
    .where(eq(whistleblowerReports.id, params.reportId))
    .returning();

  await appendAuditEntry({
    actorTier: params.tier,
    action: "whistleblower.status_updated",
    entityType: "whistleblower_report",
    entityId: params.reportId,
    payload: { status: params.status },
  });

  return row;
}
