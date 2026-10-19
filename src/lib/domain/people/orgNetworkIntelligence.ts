// Org network & collaboration health.
//
// HARD CONSTRAINT: every function in this file accepts only metadata —
// participant/sender/recipient ids, timestamps, durations, channel labels.
// None of the input types below have a field capable of holding message
// content, subject lines, or attachments, and nothing here ever queries for
// one. This is intentional and is exercised by tests/orgNetwork.test.ts.
// See docs/PRIVACY.md "Org network analytics" section.

export interface MeetingMeta {
  meetingId: string;
  participantIds: number[];
  organizerId: number;
  durationMinutes: number;
  recurring: boolean;
}

export interface MessageMeta {
  fromId: number;
  toId: number;
  channel: "chat" | "email" | "comment";
}

export interface CollaborationLoad {
  personId: number;
  meetingHoursPerWeek: number;
  distinctCollaborators: number;
  messageVolume: number;
  loadLevel: "low" | "balanced" | "high" | "overloaded";
}

export function computeCollaborationLoad(
  personId: number,
  meetings: MeetingMeta[],
  messages: MessageMeta[],
  weeks = 1,
): CollaborationLoad {
  const personMeetings = meetings.filter((m) => m.participantIds.includes(personId));
  const meetingMinutes = personMeetings.reduce((sum, m) => sum + m.durationMinutes, 0);
  const meetingHoursPerWeek = Number((meetingMinutes / 60 / weeks).toFixed(1));

  const collaborators = new Set<number>();
  personMeetings.forEach((m) => m.participantIds.forEach((id) => id !== personId && collaborators.add(id)));
  const personMessages = messages.filter((m) => m.fromId === personId || m.toId === personId);
  personMessages.forEach((m) => collaborators.add(m.fromId === personId ? m.toId : m.fromId));

  let loadLevel: CollaborationLoad["loadLevel"] = "balanced";
  if (meetingHoursPerWeek < 5) loadLevel = "low";
  else if (meetingHoursPerWeek > 25) loadLevel = "overloaded";
  else if (meetingHoursPerWeek > 18) loadLevel = "high";

  return {
    personId,
    meetingHoursPerWeek,
    distinctCollaborators: collaborators.size,
    messageVolume: personMessages.length,
    loadLevel,
  };
}

export interface BusFactorResult {
  teamId: number;
  busFactor: number;
  singlePointsOfFailure: { personId: number; reason: string }[];
}

/**
 * Bus factor per team: how many people, if unavailable, would disconnect
 * the team's collaboration graph. Approximated via each member's share of
 * total cross-team-relevant meetings they uniquely organize/attend.
 */
export function computeBusFactor(teamId: number, teamMemberIds: number[], meetings: MeetingMeta[]): BusFactorResult {
  const relevant = meetings.filter((m) => m.participantIds.some((id) => teamMemberIds.includes(id)));
  const organizerCounts = new Map<number, number>();
  relevant.forEach((m) => {
    if (teamMemberIds.includes(m.organizerId)) {
      organizerCounts.set(m.organizerId, (organizerCounts.get(m.organizerId) ?? 0) + 1);
    }
  });

  const total = relevant.length || 1;
  const singlePointsOfFailure: BusFactorResult["singlePointsOfFailure"] = [];
  organizerCounts.forEach((count, personId) => {
    const share = count / total;
    if (share >= 0.4) {
      singlePointsOfFailure.push({
        personId,
        reason: `Organizes ${Math.round(share * 100)}% of this team's tracked recurring meetings.`,
      });
    }
  });

  const busFactor = Math.max(1, teamMemberIds.length - singlePointsOfFailure.length);

  return { teamId, busFactor, singlePointsOfFailure };
}

export interface BottleneckResult {
  personId: number;
  betweenness: number;
  reason: string;
}

/**
 * Communication bottlenecks: people who sit on a disproportionate share of
 * cross-group message paths (a simple degree/brokerage proxy, not a full
 * betweenness-centrality graph algorithm — documented as an approximation).
 */
export function computeBottlenecks(messages: MessageMeta[], groupOf: Map<number, number>): BottleneckResult[] {
  const crossGroupTouch = new Map<number, number>();
  messages.forEach((m) => {
    const fromGroup = groupOf.get(m.fromId);
    const toGroup = groupOf.get(m.toId);
    if (fromGroup != null && toGroup != null && fromGroup !== toGroup) {
      crossGroupTouch.set(m.fromId, (crossGroupTouch.get(m.fromId) ?? 0) + 1);
      crossGroupTouch.set(m.toId, (crossGroupTouch.get(m.toId) ?? 0) + 1);
    }
  });

  const total = messages.length || 1;
  return Array.from(crossGroupTouch.entries())
    .map(([personId, count]) => ({
      personId,
      betweenness: Number((count / total).toFixed(3)),
      reason: `Involved in ${count} of ${total} tracked cross-team message threads.`,
    }))
    .filter((r) => r.betweenness > 0.08)
    .sort((a, b) => b.betweenness - a.betweenness);
}

export interface OnboardingLoad {
  personId: number;
  newHiresSupported: number;
  loadLevel: "normal" | "elevated";
}

export function computeOnboardingLoad(
  mentorMeetings: { mentorId: number; newHireId: number; hireDate: string }[],
  withinDays = 90,
  asOf: Date = new Date(),
): OnboardingLoad[] {
  const counts = new Map<number, Set<number>>();
  mentorMeetings.forEach((m) => {
    const ageDays = (asOf.getTime() - new Date(m.hireDate).getTime()) / 86_400_000;
    if (ageDays <= withinDays) {
      if (!counts.has(m.mentorId)) counts.set(m.mentorId, new Set());
      counts.get(m.mentorId)!.add(m.newHireId);
    }
  });

  return Array.from(counts.entries()).map(([personId, hires]) => ({
    personId,
    newHiresSupported: hires.size,
    loadLevel: hires.size >= 3 ? "elevated" : "normal",
  }));
}

export interface MeetingLoadEstimate {
  teamId: number;
  avgMeetingHoursPerWeek: number;
  recurringShare: number;
}

export function estimateMeetingLoad(teamMemberIds: number[], meetings: MeetingMeta[], weeks = 1): MeetingLoadEstimate {
  const teamMeetings = meetings.filter((m) => m.participantIds.some((id) => teamMemberIds.includes(id)));
  const totalMinutes = teamMeetings.reduce((sum, m) => sum + m.durationMinutes * m.participantIds.length, 0);
  const perPersonHours = teamMemberIds.length === 0 ? 0 : totalMinutes / 60 / teamMemberIds.length / weeks;
  const recurringCount = teamMeetings.filter((m) => m.recurring).length;

  return {
    teamId: teamMemberIds[0] ?? 0,
    avgMeetingHoursPerWeek: Number(perPersonHours.toFixed(1)),
    recurringShare: teamMeetings.length === 0 ? 0 : Number((recurringCount / teamMeetings.length).toFixed(2)),
  };
}
