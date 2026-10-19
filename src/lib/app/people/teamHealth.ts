// Orchestrates Team Health: pulls flight-risk, 1:1 follow-through, and
// collaboration-load signals for every member of a team, aggregates them
// into the five radar axes, and matches triggered playbooks. Every input is
// named here so the "evidence" behind each radar axis is traceable — see
// docs/FAIRNESS.md and docs/PRIVACY.md for how the underlying scores are
// built and scoped.

import type { Viewer } from "../../domain/types";
import { peopleRepository } from "../../platform/db/peopleRepository";
import { oneOnOneRepository } from "../../platform/db/oneOnOneRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { computeFlightRisk } from "../../domain/people/flightRisk";
import { scoreFollowThrough } from "../../domain/people/oneOnOne";
import { buildTeamHealthReport } from "../../domain/people/teamHealth";
import { buildFlightRiskInputs } from "./signals";
import { computeBusFactor } from "../../domain/people/orgNetworkIntelligence";
import { eventsRepository } from "../../platform/db/eventsRepository";

const DAY_MS = 86_400_000;

async function aggregateAt(teamId: number, memberIds: number[], asOf: Date) {
  const members = await Promise.all(memberIds.map((id) => peopleRepository.getById(id)));
  const present = members.filter((m): m is NonNullable<typeof m> => m !== null);

  const flightRisks = await Promise.all(
    present.map(async (m) => computeFlightRisk(await buildFlightRiskInputs(m, asOf), asOf).value),
  );
  const avgRisk = flightRisks.length ? flightRisks.reduce((a, b) => a + b, 0) / flightRisks.length : 0.2;

  const allOneOnOnes = (await Promise.all(present.map((m) => oneOnOneRepository.listForPerson(m.id)))).flat();
  const commitmentsBefore = allOneOnOnes
    .flatMap((o) => o.commitments)
    .filter((c) => !c.completedAt || new Date(c.completedAt).getTime() <= asOf.getTime());
  const followThrough = scoreFollowThrough(commitmentsBefore);

  const goalsAtRisk = present.reduce((sum, m) => sum + m.goals.filter((g) => g.status === "at_risk").length, 0);
  const totalGoals = present.reduce((sum, m) => sum + m.goals.length, 0) || 1;

  const meetingEvents = await eventsRepository.listByType("collaboration.meeting_logged");
  const meetings = meetingEvents
    .filter((e) => new Date(e.occurredAt).getTime() <= asOf.getTime())
    .map((e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        meetingId: String(p.meetingId),
        participantIds: p.participantIds as number[],
        organizerId: p.organizerId as number,
        durationMinutes: p.durationMinutes as number,
        recurring: Boolean(p.recurring),
      };
    });
  const bus = computeBusFactor(teamId, memberIds, meetings);

  return {
    engagement: Math.round((1 - avgRisk) * 100),
    workload: Math.round(Math.min(100, (followThrough.open / Math.max(1, present.length)) * 40 + 30)),
    velocity: Math.round(followThrough.rate * 100),
    quality: Math.round((1 - goalsAtRisk / totalGoals) * 100),
    riskIndex: Math.round(avgRisk * 70 + (bus.singlePointsOfFailure.length > 0 ? 30 : 0)),
    busFactor: bus,
    followThrough,
  };
}

function triggeredPlaybooks(latest: Awaited<ReturnType<typeof aggregateAt>>): string[] {
  const triggers: string[] = [];
  if (latest.busFactor.singlePointsOfFailure.length > 0) triggers.push("bus-factor-mitigation");
  if (latest.workload > 70) triggers.push("workload-rebalance");
  if (latest.engagement < 60) triggers.push("growth-conversation-overdue");
  return triggers;
}

export async function getTeamHealth(viewer: Viewer, teamId: number) {
  const allowed = viewer.role === "manager" || viewer.role === "hr" || viewer.role === "exec";
  await accessAuditRepository.log({
    viewer,
    subjectId: null,
    resource: "teamHealth.get",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? "Manager/HR/exec may view aggregate Team Health." : "Team Health requires manager, HR, or exec access.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const members = await peopleRepository.listByTeam(teamId);
  const memberIds = members.map((m) => m.id);
  const now = new Date();

  const periods = [60, 30, 14, 0]; // days ago, oldest first
  const history = await Promise.all(
    periods.map(async (daysAgo) => {
      const asOf = new Date(now.getTime() - daysAgo * DAY_MS);
      const agg = await aggregateAt(teamId, memberIds, asOf);
      return { period: daysAgo === 0 ? "current" : `${daysAgo}d ago`, ...agg };
    }),
  );

  const latest = history[history.length - 1];
  const report = buildTeamHealthReport({
    teamId,
    engagement: latest.engagement,
    workload: latest.workload,
    velocity: latest.velocity,
    quality: latest.quality,
    riskIndex: latest.riskIndex,
    history: history.map((h) => ({
      period: h.period,
      engagement: h.engagement,
      workload: h.workload,
      velocity: h.velocity,
      quality: h.quality,
      riskIndex: h.riskIndex,
    })),
    triggeredPlaybookIds: triggeredPlaybooks(latest),
  });

  return { ok: true as const, report, busFactor: latest.busFactor, followThrough: latest.followThrough };
}
