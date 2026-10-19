// "What does LEADOS know about me and why" — a GDPR Art. 15-style subject
// access view. Available to the person themself (and HR, for compliance
// response purposes). Lists categories of data held, lawful purpose for
// each, who can see it, and recent access to their own record.

import type { Viewer } from "../../domain/types";
import { peopleRepository } from "../../platform/db/peopleRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { consentRepository } from "../../platform/db/consentRepository";
import { oneOnOneRepository } from "../../platform/db/oneOnOneRepository";
import { growthRepository } from "../../platform/db/growthRepository";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { CONSENT_SCOPES, TRANSPARENCY_NOTICE_VERSION } from "../../domain/people/privacy";

export interface TransparencyCategory {
  category: string;
  fields: string[];
  lawfulPurpose: string;
  visibleTo: string[];
  retention: string;
}

const CATEGORIES: TransparencyCategory[] = [
  {
    category: "Core profile",
    fields: ["displayName", "email", "title", "team", "manager", "hireDate", "location"],
    lawfulPurpose: "Employment administration (contract performance).",
    visibleTo: ["self", "manager", "hr", "exec", "coworkers (basic fields only)"],
    retention: "Duration of employment + statutory retention period.",
  },
  {
    category: "Compensation (compa-ratio)",
    fields: ["compaRatio"],
    lawfulPurpose: "Compensation administration; input to flight-risk retention planning (legitimate interest).",
    visibleTo: ["self", "manager", "hr", "exec"],
    retention: "Duration of employment + statutory retention period.",
  },
  {
    category: "Skills & goals",
    fields: ["skills", "goals"],
    lawfulPurpose: "Performance and development support.",
    visibleTo: ["self", "manager", "hr", "exec"],
    retention: "Duration of employment.",
  },
  {
    category: "1:1s & commitments",
    fields: ["sharedAgenda", "commitments", "sharedSummary"],
    lawfulPurpose: "Management of the employment relationship; coaching support.",
    visibleTo: ["self", "manager", "hr"],
    retention: "Duration of employment.",
  },
  {
    category: "Manager's private 1:1 notes",
    fields: ["privateManagerNotes"],
    lawfulPurpose: "Manager's own working notes to prepare for coaching conversations.",
    visibleTo: ["authoring manager", "hr (on request/compliance basis)"],
    retention: "Duration of the manager's tenure over this report, or 12 months, whichever is shorter.",
  },
  {
    category: "Growth plans & milestones",
    fields: ["growthPlans", "milestones", "evidence"],
    lawfulPurpose: "Career development support.",
    visibleTo: ["self", "manager", "hr"],
    retention: "Duration of employment.",
  },
  {
    category: "Flight-risk estimate",
    fields: ["flightRiskScore", "drivers", "recommendations"],
    lawfulPurpose:
      "Retention planning and manager coaching (legitimate interest). Never used for automated decisions about pay, promotion, or termination. Protected attributes (age, gender, ethnicity, etc.) are never inputs — see docs/FAIRNESS.md.",
    visibleTo: ["manager", "hr", "exec"],
    retention: "Recomputed on read; not persisted beyond the audit trail of who viewed it.",
  },
  {
    category: "Succession readiness",
    fields: ["readiness", "confidence", "evidence", "gapPlan"],
    lawfulPurpose: "Workforce and business-continuity planning.",
    visibleTo: ["self", "manager", "hr", "exec"],
    retention: "Duration of employment.",
  },
  {
    category: "Collaboration metadata",
    fields: ["meetingHoursPerWeek", "distinctCollaborators", "messageVolume"],
    lawfulPurpose: "Organizational network health and workload balance. Metadata only — never message or meeting content.",
    visibleTo: ["self (own load)", "manager", "hr", "exec (aggregate)"],
    retention: "Rolling 90-day window.",
  },
];

export async function getTransparencyReport(viewer: Viewer, personId: number) {
  const allowed = viewer.id === personId || viewer.role === "hr";
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "person.transparency",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed
      ? "Subject access requests are available to the data subject and HR (compliance response)."
      : "Only the data subject or HR may view this transparency report.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const person = await peopleRepository.getById(personId);
  if (!person) return { ok: false as const, error: "not_found" };

  const [consent, recentAccess, oneOnOnes, growthPlans, rawEvents] = await Promise.all([
    consentRepository.currentStatus(personId),
    accessAuditRepository.listForSubject(personId, 25),
    oneOnOneRepository.listForPerson(personId),
    growthRepository.listForPerson(personId),
    eventsRepository.listForSubject(personId),
  ]);

  return {
    ok: true as const,
    noticeVersion: TRANSPARENCY_NOTICE_VERSION,
    consentScopes: CONSENT_SCOPES,
    currentConsent: consent,
    categories: CATEGORIES,
    counts: {
      events: rawEvents.length,
      oneOnOnes: oneOnOnes.length,
      growthPlans: growthPlans.length,
    },
    recentAccess: recentAccess.map((a) => ({
      at: a.createdAt,
      byRole: a.requesterRole,
      resource: a.resource,
      allowed: a.allowed,
      fieldsRedacted: a.fieldsRedacted,
    })),
    rights: [
      "Right of access (what you're reading now).",
      "Right to rectification of inaccurate core profile data.",
      "Right to object to flight-risk scoring for legitimate-interest processing — raise with HR.",
      "Right to lodge a complaint with your local data protection authority.",
    ],
  };
}
