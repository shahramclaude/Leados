import type { Viewer } from "../../domain/types";
import { canView } from "../../domain/people/privacy";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { peopleRepository } from "../../platform/db/peopleRepository";
import {
  computeBottlenecks,
  computeBusFactor,
  computeCollaborationLoad,
  computeOnboardingLoad,
  estimateMeetingLoad,
  type MeetingMeta,
  type MessageMeta,
} from "../../domain/people/orgNetworkIntelligence";

async function loadMeta(): Promise<{ meetings: MeetingMeta[]; messages: MessageMeta[] }> {
  const [meetingEvents, messageEvents] = await Promise.all([
    eventsRepository.listByType("collaboration.meeting_logged"),
    eventsRepository.listByType("collaboration.message_logged"),
  ]);

  const meetings: MeetingMeta[] = meetingEvents.map((e) => {
    const p = e.payload as Record<string, unknown>;
    return {
      meetingId: String(p.meetingId),
      participantIds: p.participantIds as number[],
      organizerId: p.organizerId as number,
      durationMinutes: p.durationMinutes as number,
      recurring: Boolean(p.recurring),
    };
  });

  const messages: MessageMeta[] = messageEvents.map((e) => {
    const p = e.payload as Record<string, unknown>;
    return { fromId: p.fromId as number, toId: p.toId as number, channel: p.channel as MessageMeta["channel"] };
  });

  return { meetings, messages };
}

export async function getPersonCollaborationLoad(viewer: Viewer, personId: number) {
  const allowed = canView(viewer, personId, "collaborationLoadSelf");
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "orgNetwork.collaborationLoad",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Self/manager/HR/exec may see this collaboration load." : "Collaboration load requires self, manager, HR, or exec access.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const { meetings, messages } = await loadMeta();
  const load = computeCollaborationLoad(personId, meetings, messages);
  return { ok: true as const, load };
}

export async function getTeamNetworkHealth(viewer: Viewer, teamId: number) {
  const allowed = canView(viewer, -1, "collaborationLoadAggregate") || viewer.role === "manager" || viewer.role === "hr" || viewer.role === "exec";
  await accessAuditRepository.log({
    viewer,
    subjectId: null,
    resource: "orgNetwork.teamHealth",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Manager/HR/exec may view aggregate org-network metrics." : "Aggregate org-network analytics require manager, HR, or exec access.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const members = await peopleRepository.listByTeam(teamId);
  const memberIds = members.map((m) => m.id);
  const { meetings, messages } = await loadMeta();

  const busFactor = computeBusFactor(teamId, memberIds, meetings);
  const meetingLoad = estimateMeetingLoad(memberIds, meetings);
  const groupOf = new Map(members.map((m) => [m.id, m.teamId ?? teamId]));
  const bottlenecks = computeBottlenecks(messages, groupOf);
  const onboardingLoad = computeOnboardingLoad(
    members.map((m) => ({ mentorId: m.managerId ?? m.id, newHireId: m.id, hireDate: m.hireDate })),
  );

  return {
    ok: true as const,
    teamId,
    busFactor,
    meetingLoad,
    bottlenecks: bottlenecks.filter((b) => memberIds.includes(b.personId)),
    onboardingLoad,
    constraintNotice:
      "Computed entirely from collaboration metadata (participant ids, timestamps, durations, channel). No message or meeting content is ever collected or used.",
  };
}
