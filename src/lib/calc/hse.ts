// Part 127 — statutory reporting clocks and the root-cause validator.
// Dignity rule: a root cause of "human error" alone is rejected — the system
// requires at least one named system-contributing factor.

export function isRegulatoryReportable(severity: number): boolean {
  return severity >= 4;
}

// Illustrative statutory clock (configurable policy, not a specific jurisdiction's
// law): severity 5 events must be reported within 24h, severity 4 within 7 days.
export function statutoryReportDueAt(occurredAt: Date, severity: number): Date | null {
  if (!isRegulatoryReportable(severity)) return null;
  const dueDays = severity >= 5 ? 1 : 7;
  const due = new Date(occurredAt);
  due.setUTCDate(due.getUTCDate() + dueDays);
  return due;
}

export type RootCauseValidation = { valid: boolean; reason?: string };

export function validateRootCause(
  rootCauseIsHumanErrorOnly: boolean,
  systemContributingFactor: string | null | undefined,
): RootCauseValidation {
  if (rootCauseIsHumanErrorOnly && (!systemContributingFactor || systemContributingFactor.trim().length === 0)) {
    return {
      valid: false,
      reason:
        "Rejected: 'human error' alone is not an accepted root cause. Name at least one system-contributing factor.",
    };
  }
  return { valid: true };
}

// Anonymity enforcement helper — when a report is anonymous, no reporter name may
// ever be persisted or returned. This is applied at the write boundary in actions.ts
// (storage-layer enforcement, not just UI hiding).
export function sanitizeReporterName(anonymous: boolean, reporterName: string | null | undefined): string | null {
  if (anonymous) return null;
  return reporterName ?? null;
}
