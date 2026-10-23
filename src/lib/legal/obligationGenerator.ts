// Obligation generation from confirmed clauses (Phase 1 "obligation generation ... Part 29's tracker").
//
// Generation only runs against CONFIRMED clauses — generating an obligation from a draft clause would
// defeat the human-confirmation gate by laundering an unconfirmed extraction into a tracked obligation.
// Generated obligations are themselves created in `draft` status; a second, separate human confirmation
// is required before `commitObligation` can move them to `active` (see obligationGate.ts). This double
// gate is deliberate: confirming the clause extraction is a different judgment from confirming the
// resulting obligation (owner, deadline, control) is correctly specified.

import { db } from "@/db";
import { clauses, contracts, obligations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeRenewalWindow } from "./dates";
import type { ClauseType } from "./clauseTypes";

const DEFAULT_SEVERITY: Record<ClauseType, "low" | "medium" | "high" | "critical"> = {
  term: "low",
  renewal: "medium",
  termination: "medium",
  sla: "medium",
  indemnity: "high",
  liability_cap: "high",
  change_of_control: "critical",
  data_protection: "high",
};

export async function generateObligationFromClause(clauseId: number) {
  const [clause] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
  if (!clause) throw new Error("Clause not found");
  if (clause.status !== "confirmed") {
    throw new Error(
      "Cannot generate an obligation from an unconfirmed clause. Confirm the extraction first.",
    );
  }
  if (!clause.contractId) {
    throw new Error("Clause is not linked to a contract; cannot generate obligation.");
  }

  const [contract] = await db.select().from(contracts).where(eq(contracts.id, clause.contractId));
  if (!contract) throw new Error("Linked contract not found");

  let dueDate: Date | null = null;
  let cadence: string | null = null;
  let description = `Review obligation derived from confirmed ${clause.clauseType.replace("_", " ")} clause.`;

  const clauseType = clause.clauseType as ClauseType;

  if (clauseType === "renewal" || clauseType === "termination" || clauseType === "term") {
    const window = computeRenewalWindow({
      effectiveDate: contract.effectiveDate,
      termMonths: contract.termMonths,
      renewalWindowDays: contract.renewalWindowDays,
      terminationNoticeDays: contract.terminationNoticeDays,
    });
    dueDate = window.noticeDeadline;
    description = `Decide renew/terminate for "${contract.title}" before the ${contract.terminationNoticeDays}-day notice deadline (term ends ${window.termEndDate.toISOString().slice(0, 10)}).`;
  } else if (clauseType === "sla") {
    cadence = "quarterly";
    description = `Review SLA performance / service-credit entitlement for "${contract.title}" against the confirmed SLA clause.`;
  } else if (clauseType === "data_protection") {
    cadence = "annual";
    description = `Confirm technical/organizational data-protection measures are still in force for "${contract.title}".`;
  } else if (clauseType === "indemnity" || clauseType === "liability_cap") {
    cadence = "annual";
    description = `Annual risk review of ${clauseType.replace("_", " ")} exposure under "${contract.title}".`;
  } else if (clauseType === "change_of_control") {
    description = `No standing action required unless a change-of-control event is triggered (see cascade analysis) for "${contract.title}".`;
  }

  const [row] = await db
    .insert(obligations)
    .values({
      clauseId: clause.id,
      contractId: contract.id,
      description,
      ownerPartyId: contract.internalOwnerPartyId,
      dueDate: dueDate ?? undefined,
      cadence: cadence ?? undefined,
      jurisdictionTags: contract.governingLaw ? [contract.governingLaw] : [],
      severity: DEFAULT_SEVERITY[clauseType],
      status: "draft",
    })
    .returning();

  return row;
}
