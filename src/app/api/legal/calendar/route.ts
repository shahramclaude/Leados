// Renewal Calendar: upcoming renewal/termination windows with a pre-window impact analysis
// (confirmed obligations + change-of-control exposure tied to each contract), using Part 25's cadence
// seam for "how far out" framing.
import { db } from "@/db";
import { clauses, contracts, obligations, parties } from "@/db/schema";
import { computeRenewalWindow } from "@/lib/legal/dates";
import { daysUntil } from "@/lib/legal/cadenceSeam";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allContracts = await db
    .select({
      id: contracts.id,
      title: contracts.title,
      effectiveDate: contracts.effectiveDate,
      termMonths: contracts.termMonths,
      renewalWindowDays: contracts.renewalWindowDays,
      terminationNoticeDays: contracts.terminationNoticeDays,
      status: contracts.status,
      counterpartyName: parties.name,
    })
    .from(contracts)
    .leftJoin(parties, eq(parties.id, contracts.counterpartyPartyId));

  const now = new Date();

  const calendar = await Promise.all(
    allContracts.map(async (c) => {
      const window = computeRenewalWindow({
        effectiveDate: c.effectiveDate,
        termMonths: c.termMonths,
        renewalWindowDays: c.renewalWindowDays,
        terminationNoticeDays: c.terminationNoticeDays,
      });

      const contractClauses = await db.select().from(clauses).where(eq(clauses.contractId, c.id));
      const confirmedClauses = contractClauses.filter((cl) => cl.status === "confirmed");
      const hasChangeOfControl = confirmedClauses.some((cl) => cl.clauseType === "change_of_control");

      const contractObligations = await db.select().from(obligations).where(eq(obligations.contractId, c.id));
      const openObligations = contractObligations.filter((o) => o.status === "active" || o.status === "confirmed");

      return {
        contractId: c.id,
        title: c.title,
        counterpartyName: c.counterpartyName,
        status: c.status,
        termEndDate: window.termEndDate,
        windowOpensAt: window.windowOpensAt,
        noticeDeadline: window.noticeDeadline,
        daysUntilNoticeDeadline: daysUntil(now, window.noticeDeadline),
        impactAnalysis: {
          confirmedClauseCount: confirmedClauses.length,
          draftClauseCount: contractClauses.length - confirmedClauses.length,
          openObligationCount: openObligations.length,
          changeOfControlExposure: hasChangeOfControl,
        },
      };
    }),
  );

  calendar.sort((a, b) => a.noticeDeadline.getTime() - b.noticeDeadline.getTime());

  return Response.json({ calendar });
}
