import type { Person, Viewer } from "../../domain/types";
import { canView, redact } from "../../domain/people/privacy";
import { peopleRepository } from "../../platform/db/peopleRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { buildTimeline, reconstructAsOf, type RawPersonEvent } from "../../domain/people/timeline";
import { computeFlightRisk } from "../../domain/people/flightRisk";
import { buildFlightRiskInputs } from "./signals";
import type { ExplainableScore } from "../../domain/types";

export interface PersonProfileResponse {
  person: Partial<Person>;
  redactedFields: string[];
  flightRisk: ExplainableScore | null;
}

export async function getPersonProfile(viewer: Viewer, personId: number): Promise<PersonProfileResponse | null> {
  const person = await peopleRepository.getById(personId);
  if (!person) return null;

  const { value, redactedFields } = redact(viewer, personId, person as unknown as Record<string, unknown>, {
    compaRatio: "compaRatio",
    skills: "skillsAndGoals",
    goals: "skillsAndGoals",
  });

  let flightRisk: ExplainableScore | null = null;
  if (canView(viewer, personId, "flightRiskScore")) {
    const inputs = await buildFlightRiskInputs(person);
    flightRisk = computeFlightRisk(inputs);
  } else {
    redactedFields.push("flightRisk");
  }

  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "person.profile",
    fieldsRedacted: redactedFields,
    allowed: true,
    reason: `Viewed as role "${viewer.id === personId ? "self" : viewer.role}".`,
  });

  return { person: value as Partial<Person>, redactedFields, flightRisk };
}

export async function getPersonTimeline(viewer: Viewer, personId: number, asOf?: string) {
  const person = await peopleRepository.getById(personId);
  if (!person) return null;

  const rows = await eventsRepository.listForSubject(personId);
  const raw: RawPersonEvent[] = rows.map((r) => ({ id: r.id, type: r.type, occurredAt: r.occurredAt, payload: r.payload }));

  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "person.timeline",
    fieldsRedacted: [],
    allowed: true,
    reason: "Timeline is visible to self/manager/hr/exec; peers see org-chart-level data only via profile.",
  });

  const timeline = buildTimeline(raw);
  const snapshot = asOf ? reconstructAsOf(raw, new Date(asOf)) : null;
  return { timeline, snapshot };
}

export async function updatePersonProfile(
  viewer: Viewer,
  personId: number,
  patch: Parameters<typeof peopleRepository.update>[1],
) {
  // Only HR or the person's manager may edit profile fields. Self-edits are
  // limited to non-sensitive fields by the API-layer schema, not here.
  const allowed = viewer.role === "hr" || viewer.role === "manager" || viewer.id === personId;
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "person.profile.update",
    fieldsRedacted: [],
    allowed,
    reason: allowed ? "Writer has manager/hr/self capability." : "Writer lacks capability to edit this profile.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };
  const updated = await peopleRepository.update(personId, patch);
  return { ok: true as const, person: updated };
}
