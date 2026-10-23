// GET /api/time-economics/dashboard/org
//
// Org-aggregate Time Dashboard: cost trend, fragmentation, outcome
// density — rolled up so no individual is identifiable. Any
// group-by-team breakdown is suppressed below the k-anonymity floor
// (MIN_AGGREGATE_GROUP_SIZE in privacy.ts) rather than silently shown
// with a small, de-anonymizable N.
import {
  getActorFromRequest,
  getDemoOrg,
  getOrgConfigOrDefault,
  listEventsForOrg,
  listAttendeesForEvent,
  getUserRate,
  listOutcomesForEventIds,
  listTeamsWithMembers,
  orgUserCount,
} from "@/lib/time-economics/repo";
import { computeMeetingCost } from "@/lib/time-economics/meetingCost";
import { meetsKAnonymityFloor, PRIVACY_K_ANONYMITY_FLOOR } from "@/lib/time-economics/privacy";
import type { AttendeeInput } from "@/lib/time-economics/types";
import type { Chronotype } from "@/lib/time-economics/circadian";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const actor = await getActorFromRequest(req);
  if (!actor) return Response.json({ error: "Missing or invalid x-user-id" }, { status: 401 });

  const org = await getDemoOrg();
  if (!org) return Response.json({ weeks: [] });

  const cfg = await getOrgConfigOrDefault(org.id);
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const events = await listEventsForOrg(org.id, since);
  const eventIds = events.map((e) => e.id);
  const outcomes = await listOutcomesForEventIds(eventIds);
  const outcomeByEvent = new Map(outcomes.map((o) => [o.eventId, o]));

  let totalCost = 0;
  let totalOutcomes = 0;
  let totalHours = 0;
  const weekBuckets = new Map<string, { cost: number; outcomes: number; hours: number; meetings: number }>();

  for (const ev of events) {
    const attendeesRaw = await listAttendeesForEvent(ev.id);
    const attendeeInputs: AttendeeInput[] = [];
    for (const a of attendeesRaw) {
      const rate = await getUserRate(a.userId, Number(cfg.defaultLoadedHourlyRate));
      attendeeInputs.push({ userId: a.userId, loadedHourlyRate: rate, required: a.required, interruptsDeepWork: false, chronotype: a.chronotype as Chronotype });
    }
    const cost = computeMeetingCost({
      orgId: org.id,
      eventId: ev.id,
      title: ev.title,
      startTime: ev.startTime,
      endTime: ev.endTime,
      attendees: attendeeInputs,
      deepWorkPremiumMultiplier: Number(cfg.deepWorkPremiumMultiplier),
      recoveryMinutesPerInterruption: cfg.recoveryMinutesPerInterruption,
    });
    const outcome = outcomeByEvent.get(ev.id);
    const outcomeCount = (outcome?.decisionsCount ?? 0) + (outcome?.actionsCount ?? 0);

    totalCost += cost.totalCost;
    totalOutcomes += outcomeCount;
    totalHours += cost.durationHours;

    const weekKey = isoWeekKey(ev.startTime);
    const bucket = weekBuckets.get(weekKey) ?? { cost: 0, outcomes: 0, hours: 0, meetings: 0 };
    bucket.cost += cost.totalCost;
    bucket.outcomes += outcomeCount;
    bucket.hours += cost.durationHours;
    bucket.meetings += 1;
    weekBuckets.set(weekKey, bucket);
  }

  const weeks = Array.from(weekBuckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, b]) => ({
      week,
      totalCost: round2(b.cost),
      totalOutcomes: b.outcomes,
      totalHours: round2(b.hours),
      meetingCount: b.meetings,
      outcomeDensityPerHour: b.hours > 0 ? round2(b.outcomes / b.hours) : 0,
    }));

  const orgSize = await orgUserCount(org.id);
  const teams = await listTeamsWithMembers(org.id);
  const teamBreakdown = teams.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    memberCount: t.memberIds.length,
    suppressed: !meetsKAnonymityFloor(t.memberIds.length),
  }));

  return Response.json({
    orgId: org.id,
    currency: cfg.currency,
    orgSize,
    kAnonymityFloor: PRIVACY_K_ANONYMITY_FLOOR,
    orgMeetsAggregateFloor: meetsKAnonymityFloor(orgSize),
    totals: { totalCost: round2(totalCost), totalOutcomes, totalHours: round2(totalHours) },
    weeks,
    teamBreakdown: teamBreakdown.map((t) =>
      t.suppressed
        ? { teamId: t.teamId, teamName: t.teamName, memberCount: t.memberCount, suppressed: true, reason: `Team has ${t.memberCount} member(s), below the k=${PRIVACY_K_ANONYMITY_FLOOR} anonymity floor — team-level time metrics withheld to avoid identifying individuals.` }
        : { teamId: t.teamId, teamName: t.teamName, memberCount: t.memberCount, suppressed: false },
    ),
    method: [
      "All figures are modeled estimates (see MODEL-CARD.md) aggregated at org/week granularity — no individual is identified.",
      `Team-level breakdowns are withheld when team size < ${PRIVACY_K_ANONYMITY_FLOOR} to preserve k-anonymity.`,
    ],
  });
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
