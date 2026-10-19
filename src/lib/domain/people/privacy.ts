// Privacy architecture for the people domain. Pure logic — no DB, no HTTP —
// so it can be unit-tested in isolation and imported by both repositories
// and API routes without creating a dependency cycle.
//
// Design (role-based visibility):
//   self     — the person the data is about
//   manager  — that person's direct manager (walks the reporting line once)
//   hr       — HR business partner / people team, org-wide
//   exec     — leadership, org-wide, aggregate-biased (sees scores, not raw notes)
//   peer     — anyone else (coworker, skip-level who isn't the manager, etc.)
//
// The default is deny: a field not explicitly allowed for a role is redacted.

import { PROTECTED_ATTRIBUTES, type Viewer, type ViewerRole } from "../types";

export type SensitiveField =
  | "compaRatio"
  | "flightRiskScore"
  | "privateManagerNotes"
  | "successionReadiness"
  | "growthPlan"
  | "oneOnOneShared"
  | "skillsAndGoals"
  | "basicProfile"
  | "collaborationLoadSelf"
  | "collaborationLoadAggregate";

const VISIBILITY: Record<SensitiveField, ViewerRole[]> = {
  basicProfile: ["self", "manager", "hr", "exec", "peer"],
  skillsAndGoals: ["self", "manager", "hr", "exec"],
  growthPlan: ["self", "manager", "hr"],
  oneOnOneShared: ["self", "manager", "hr"],
  compaRatio: ["self", "manager", "hr", "exec"],
  // Flight-risk *scores* are manager/HR/exec-facing by design: publishing a
  // raw attrition probability to the person it's about risks becoming a
  // self-fulfilling prophecy and isn't necessary for the lawful purpose
  // (retention planning). The person's *right to know this category of
  // processing happens* is satisfied separately by the transparency report
  // (GDPR Art. 15), which never varies by role.
  flightRiskScore: ["manager", "hr", "exec"],
  privateManagerNotes: ["manager", "hr"],
  successionReadiness: ["self", "manager", "hr", "exec"],
  collaborationLoadSelf: ["self", "manager", "hr", "exec"],
  collaborationLoadAggregate: ["manager", "hr", "exec"],
};

export function canView(viewer: Viewer, subjectId: number, field: SensitiveField): boolean {
  const role: ViewerRole = viewer.id === subjectId ? "self" : viewer.role;
  return VISIBILITY[field].includes(role);
}

/** Resolve the effective role for a (viewer, subject) pair — "self" wins over any asserted role. */
export function effectiveRole(viewer: Viewer, subjectId: number): ViewerRole {
  return viewer.id === subjectId ? "self" : viewer.role;
}

export interface RedactionResult<T> {
  value: T;
  redactedFields: string[];
}

/**
 * Generic object redactor: given a map of field -> SensitiveField category,
 * strips any field the viewer isn't allowed to see and replaces it with
 * `undefined`, returning which fields were redacted (for the audit log).
 */
export function redact<T extends Record<string, unknown>>(
  viewer: Viewer,
  subjectId: number,
  value: T,
  fieldMap: Partial<Record<keyof T, SensitiveField>>,
): RedactionResult<Partial<T>> {
  const out: Partial<T> = { ...value };
  const redactedFields: string[] = [];
  for (const key of Object.keys(fieldMap) as (keyof T)[]) {
    const category = fieldMap[key];
    if (!category) continue;
    if (!canView(viewer, subjectId, category)) {
      delete out[key];
      redactedFields.push(String(key));
    }
  }
  return { value: out, redactedFields };
}

/**
 * Throws if `candidate` contains any key that is a protected attribute
 * (age, gender, ethnicity, ...). Call this at the boundary of every scoring
 * engine that accepts a feature bag, so a future contributor cannot
 * accidentally wire a protected attribute into a model even by mistake.
 */
export function assertNoProtectedAttributes(candidate: Record<string, unknown>): void {
  const offending = Object.keys(candidate).filter((key) =>
    (PROTECTED_ATTRIBUTES as readonly string[]).includes(key),
  );
  if (offending.length > 0) {
    throw new Error(
      `Protected attribute(s) [${offending.join(", ")}] must never be used as a scoring input. ` +
        `This is a hard guardrail — see src/lib/domain/types.ts PROTECTED_ATTRIBUTES.`,
    );
  }
}

export const TRANSPARENCY_NOTICE_VERSION = "2026-01-people-analytics-v1";

/** The scopes a person can consent to / withdraw from, used by consent.recorded events. */
export const CONSENT_SCOPES = [
  "flight-risk-scoring",
  "succession-planning",
  "org-network-analytics",
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];
