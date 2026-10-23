// Part 125 — contract renewal notice-date math and invoice three-way match.

export type RenewalAlertStatus = "decided" | "overdue" | "alert" | "on-track";

export function renewalAlertStatus(
  renewalDateIso: string,
  noticeDays: number,
  decisionMade: boolean,
  today: Date = new Date(),
): { status: RenewalAlertStatus; daysToDeadline: number; noticeDeadlineIso: string } {
  const renewalDate = new Date(`${renewalDateIso}T00:00:00Z`);
  const noticeDeadline = new Date(renewalDate);
  noticeDeadline.setUTCDate(noticeDeadline.getUTCDate() - noticeDays);

  const msPerDay = 24 * 60 * 60 * 1000;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysToDeadline = Math.round((noticeDeadline.getTime() - todayUtc) / msPerDay);

  let status: RenewalAlertStatus;
  if (decisionMade) status = "decided";
  else if (daysToDeadline < 0) status = "overdue";
  else if (daysToDeadline <= 30) status = "alert";
  else status = "on-track";

  return { status, daysToDeadline, noticeDeadlineIso: noticeDeadline.toISOString().slice(0, 10) };
}

export type InvoiceMatchStatus = "three-way-matched" | "two-way-matched" | "no-po" | "exception";

export function invoiceMatchStatus(
  poAmount: number | null,
  receiptAmount: number | null,
  invoiceAmount: number,
  toleranceUsd: number,
): InvoiceMatchStatus {
  if (poAmount == null) return "no-po";
  const poDiff = Math.abs(poAmount - invoiceAmount);
  if (receiptAmount == null) {
    return poDiff <= toleranceUsd ? "two-way-matched" : "exception";
  }
  const receiptDiff = Math.abs(receiptAmount - invoiceAmount);
  if (poDiff <= toleranceUsd && receiptDiff <= toleranceUsd) return "three-way-matched";
  if (poDiff <= toleranceUsd) return "two-way-matched";
  return "exception";
}

// Bank-detail changes require dual control before payment can proceed — a single
// approver can never clear a bank-change request (the takeover-attempt guard).
export function bankChangePaymentAllowed(bankChangeRequested: boolean, dualControlApproved: boolean): boolean {
  if (!bankChangeRequested) return true;
  return dualControlApproved;
}

const ENUMERATED_RISK_CLAUSES = [
  "unlimited-liability",
  "auto-escalation",
  "most-favored-nation",
  "assignment-restriction",
  "exclusivity",
  "non-compete",
  "indemnification-uncapped",
  "termination-for-convenience-absent",
  "ip-assignment-overreach",
  "data-residency-gap",
  "audit-rights-absent",
  "sla-credits-absent",
  "change-of-control-trigger",
  "governing-law-unfavorable",
  "price-escalation-uncapped",
] as const;

export type RiskClause = (typeof ENUMERATED_RISK_CLAUSES)[number];

export function enumeratedRiskClauses(): readonly RiskClause[] {
  return ENUMERATED_RISK_CLAUSES;
}
