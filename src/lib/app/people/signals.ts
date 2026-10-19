// Aggregates a person's raw events + current record into the named inputs
// the flight-risk engine and 1:1 talking-point engine consume. Keeping this
// in the app layer (not the domain layer) is deliberate: it does I/O
// (reads events) and is the seam between "facts that happened" and "a pure
// function that scores them."

import { eventsRepository } from "../../platform/db/eventsRepository";
import { oneOnOneRepository } from "../../platform/db/oneOnOneRepository";
import type { Person } from "../../domain/types";
import type { FlightRiskInputs } from "../../domain/people/flightRisk";
import type { RecentSignals } from "../../domain/people/oneOnOne";

const DAY_MS = 86_400_000;

export async function buildFlightRiskInputs(person: Person, asOf: Date = new Date()): Promise<FlightRiskInputs> {
  const personEvents = await eventsRepository.listForSubject(person.id);

  const growthEvents = personEvents.filter((e) => e.type === "person.growth_conversation_held");
  const lastGrowth = growthEvents.at(-1);
  const daysSinceLastGrowthConversation = lastGrowth
    ? Math.round((asOf.getTime() - new Date(lastGrowth.occurredAt).getTime()) / DAY_MS)
    : null;

  const managerChangeEvents = personEvents.filter((e) => e.type === "person.manager_changed");
  const lastManagerChange = managerChangeEvents.at(-1);
  const managerChangedInLastNDays = lastManagerChange
    ? (asOf.getTime() - new Date(lastManagerChange.occurredAt).getTime()) / DAY_MS <= 90
    : false;

  const roleChangeEvents = personEvents.filter((e) => e.type === "person.role_changed");
  const lastRoleChange = roleChangeEvents.at(-1);
  const recentRoleChange = lastRoleChange
    ? (asOf.getTime() - new Date(lastRoleChange.occurredAt).getTime()) / DAY_MS <= 90
    : false;

  const skillEvents = personEvents.filter((e) => e.type === "person.skill_evidenced");
  const lastSkillEvent = skillEvents.at(-1);
  const skillStagnationMonths = lastSkillEvent
    ? Math.round((asOf.getTime() - new Date(lastSkillEvent.occurredAt).getTime()) / (DAY_MS * 30))
    : 18; // conservative default if nothing on file

  const oneOnOnes = await oneOnOneRepository.listForPerson(person.id);
  const allCommitments = oneOnOnes.flatMap((o) => o.commitments).filter((c) => c.owner === "person");
  const resolved = allCommitments.filter((c) => c.status !== "open");
  const missed = allCommitments.filter((c) => c.status === "missed");
  const openCommitmentMissRate = resolved.length === 0 ? 0 : missed.length / resolved.length;

  const goalsAtRiskCount = person.goals.filter((g) => g.status === "at_risk").length;

  return {
    tenureMonths: person.tenureMonths,
    compaRatio: person.compaRatio,
    daysSinceLastGrowthConversation,
    managerChangedInLastNDays,
    openCommitmentMissRate,
    goalsAtRiskCount,
    skillStagnationMonths,
    recentRoleChange,
  };
}

export async function buildRecentSignals(person: Person, asOf: Date = new Date()): Promise<RecentSignals> {
  const inputs = await buildFlightRiskInputs(person, asOf);
  const oneOnOnes = await oneOnOneRepository.listForPerson(person.id);
  const missedCommitments = oneOnOnes.flatMap((o) => o.commitments).filter((c) => c.status === "missed");

  const personEvents = await eventsRepository.listForSubject(person.id);
  const recentSkillEvidence = personEvents
    .filter((e) => e.type === "person.skill_evidenced" && (asOf.getTime() - new Date(e.occurredAt).getTime()) / DAY_MS <= 30)
    .map((e) => (e.payload as { skill?: string }).skill)
    .filter((s): s is string => Boolean(s));

  return {
    daysSinceLastGrowthConversation: inputs.daysSinceLastGrowthConversation,
    goalsAtRisk: person.goals.filter((g) => g.status === "at_risk").map((g) => g.title),
    missedCommitments,
    recentSkillEvidence,
    managerChangedRecently: inputs.managerChangedInLastNDays,
  };
}
