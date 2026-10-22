// src/lib/complianceStatus.ts
//
// HONESTY RULE enforcement, in code: this is the ONLY function in the
// codebase allowed to produce a compliance status label. Every call site
// (UI pages, API routes, board report) must go through `computeComplianceStatus`
// so a "compliant"/green claim can never be rendered without a concrete
// evidence reference (an audit_events.id). If there is no evidence, the
// status is explicitly "no_evidence" / "unknown" — never a bare checkmark.
//
// scripts/validate-compliance-lint.ts asserts this contract by construction
// (calling the function with/without evidence and checking the output never
// claims "compliant" without an evidenceRef attached).

export type ComplianceStatusLabel =
  | "evidenced_operating" // ran on schedule, evidence present, result = pass
  | "evidenced_failed" // ran on schedule, evidence present, result = fail
  | "overdue_no_evidence" // past due date, no evidence at all
  | "no_evidence"; // not yet due / never tested — explicitly unknown, not green

export interface ComplianceStatusInput {
  dueAt: Date | null;
  executedAt: Date | null;
  result: "pass" | "fail" | null;
  evidenceAuditEventId: number | null;
  now?: Date;
}

export interface ComplianceStatusResult {
  label: ComplianceStatusLabel;
  /** Human copy that never claims certainty beyond what the evidence supports. */
  display: string;
  evidenceRef: number | null;
  asOf: string | null;
}

export function computeComplianceStatus(input: ComplianceStatusInput): ComplianceStatusResult {
  const now = input.now ?? new Date();

  if (input.executedAt && input.evidenceAuditEventId !== null && input.result) {
    return {
      label: input.result === "pass" ? "evidenced_operating" : "evidenced_failed",
      display:
        input.result === "pass"
          ? `Evidence of control operation as of ${input.executedAt.toISOString()} (audit event #${input.evidenceAuditEventId})`
          : `Evidence of control FAILURE as of ${input.executedAt.toISOString()} (audit event #${input.evidenceAuditEventId})`,
      evidenceRef: input.evidenceAuditEventId,
      asOf: input.executedAt.toISOString(),
    };
  }

  if (input.dueAt && input.dueAt.getTime() < now.getTime()) {
    return {
      label: "overdue_no_evidence",
      display: `Overdue since ${input.dueAt.toISOString()} — no evidence recorded`,
      evidenceRef: null,
      asOf: null,
    };
  }

  return {
    label: "no_evidence",
    display: "No evidence recorded yet — status unknown (not assumed compliant)",
    evidenceRef: null,
    asOf: null,
  };
}

/** UI color mapping — deliberately has no "green with no evidence" path. */
export function statusColor(label: ComplianceStatusLabel): "green" | "red" | "amber" | "slate" {
  switch (label) {
    case "evidenced_operating":
      return "green";
    case "evidenced_failed":
      return "red";
    case "overdue_no_evidence":
      return "red";
    case "no_evidence":
      return "slate";
  }
}
