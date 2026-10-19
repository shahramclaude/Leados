import type { Viewer } from "../../domain/types";
import { CONSENT_SCOPES, type ConsentScope } from "../../domain/people/privacy";
import { consentRepository } from "../../platform/db/consentRepository";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";

export async function recordConsent(
  viewer: Viewer,
  personId: number,
  scope: ConsentScope,
  noticeVersion: string,
  granted: boolean,
) {
  const allowed = viewer.id === personId || viewer.role === "hr";
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "consent.record",
    fieldsRedacted: [],
    allowed,
    reason: allowed ? "Only the data subject or HR may record consent." : "Consent can only be recorded by the data subject or HR.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };
  if (!CONSENT_SCOPES.includes(scope)) return { ok: false as const, error: "invalid_scope" };

  const record = await consentRepository.record({ personId, scope, noticeVersion, granted });
  await eventsRepository.record({
    type: "consent.recorded",
    version: 1,
    subjectId: personId,
    actorId: viewer.id,
    payload: { personId, scope, noticeVersion, granted },
  });
  return { ok: true as const, record };
}
